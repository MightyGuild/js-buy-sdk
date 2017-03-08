import GraphQLJSClient from '@shopify/graphql-js-client';
import types from '../types';
import base64Encode from './base64encode';
import './isomorphic-fetch';
import productQuery from './product-query';
import productConnectionQuery from './product-connection-query';
import collectionQuery from './collection-query';
import collectionConnectionQuery from './collection-connection-query';

function fetchAllPages(paginatedModels, client) {
  return client.fetchNextPage(paginatedModels).then(({model}) => {
    // Until we know how hasNextPage will be exposed, we query until the result is empty
    if (model.length === 0) {
      return paginatedModels;
    }

    paginatedModels.push(...model);

    return fetchAllPages(paginatedModels, client);
  });
}

function fetchAllProductResources(productData, product, client) {
  const promises = [];

  if (productData.images && productData.images.pageInfo.hasNextPage) {
    promises.push(fetchAllPages(product.images, client));
  }

  if (productData.variants && productData.variants.pageInfo.hasNextPage) {
    promises.push(fetchAllPages(product.variants, client));
  }

  return promises;
}

export default class Client {
  constructor(config, GraphQLClientClass = GraphQLJSClient) {
    const apiUrl = `https://${config.domain}/api/graphql`;
    const authHeader = `Basic ${base64Encode(config.storefrontAccessToken)}`;

    this.graphQLClient = new GraphQLClientClass(types, {
      url: apiUrl,
      fetcherOptions: {
        headers: {
          Authorization: authHeader
        }
      }
    });
  }

  fetchAllProducts(query = productConnectionQuery()) {
    return this.graphQLClient.send(query(this.graphQLClient)).then(({model, data}) => {
      const promises = model.shop.products.reduce((promiseAcc, product, i) => {
        const productData = data.shop.products.edges[i].node;

        // Fetch the rest of the images and variants for this product
        return promiseAcc.concat(fetchAllProductResources(productData, product, this.graphQLClient));
      }, []);

      return Promise.all(promises).then(() => {
        return model.shop.products;
      });
    });
  }

  fetchProduct(id, query = productQuery()) {
    return this.graphQLClient.send(query(this.graphQLClient, id)).then((response) => {
      const productData = response.data.node;

      // Fetch the rest of the images and variants for this product
      const promises = fetchAllProductResources(productData, response.model.node, this.graphQLClient);

      return Promise.all(promises).then(() => {
        return response.model.node;
      });
    });
  }

  fetchAllCollections(query = collectionConnectionQuery()) {
    return this.graphQLClient.send(query(this.graphQLClient)).then((response) => {
      return response.model.shop.collections;
    });
  }

  fetchCollection(id, query = collectionQuery()) {
    return this.graphQLClient.send(query(this.graphQLClient, id)).then((response) => {
      return response.model.node;
    });
  }
}
