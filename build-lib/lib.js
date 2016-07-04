/* global require, module */

"use strict";

const funnel = require('broccoli-funnel');
const concat = require('broccoli-concat');
const mergeTrees = require('broccoli-merge-trees');
const babelTranspiler = require('broccoli-babel-transpiler');
const uglifyJavaScript = require('broccoli-uglify-js');
const pkg = require('../package.json');
const polyfills = require('./polyfills');
const loader = require('./loader');
const babelConfig = require('./util/babel-config');
const Licenser = require('./util/licenser');
const Versioner = require('./util/versioner');
const LokkaBuilder = require('./util/lokka-builder');


function sourceTree(pathConfig, moduleType) {
  const lib = babelTranspiler(pathConfig.lib, babelConfig(pkg.name, moduleType));

  const shims = babelTranspiler(
    funnel(pathConfig.shims, { include: ['fetch.js', 'promise.js'] }),
    babelConfig(null, moduleType)
  );
  const lokka = babelTranspiler(
    (new LokkaBuilder({ outputPath: '.' })),
    babelConfig(null, moduleType)
  );

  return mergeTrees([lib, lokka, shims]);
}

module.exports = function (pathConfig, env) {
  const polyfillTree = polyfills(env);
  const loaderTree = loader();

  const trees = [{
    name: 'amd',
    moduleType: 'amd',
    additionalTrees: [],
    concatOptions: {}
  }, {
    name: 'commonjs',
    moduleType: 'commonjs',
    additionalTrees: [],
    concatOptions: {}
  }, {
    name: 'globals',
    moduleType: 'amd',
    additionalTrees: [loaderTree],
    concatOptions: {
      header: ';(function () {',
      headerFiles: ['loader.js'],
      footer: `
        window.ShopifyBuy = require('shopify-buy/shopify').default;
        })();
      `
    }
  }].map(config => {
    const baseTree = sourceTree(pathConfig, config.moduleType);

    const bareTree = concat(mergeTrees([baseTree].concat(config.additionalTrees)), Object.assign({
      inputFiles: ['**/*.js'],
      outputFile: `${pkg.name}.${config.name}.js`,
      sourceMapConfig: { enabled: false }
    }, config.concatOptions));

    const polyfilledLibTree = concat(mergeTrees([polyfillTree, bareTree]), {
      headerFiles: ['polyfills.js'],
      inputFiles: `${pkg.name}.${config.name}.js`,
      outputFile: `${pkg.name}.polyfilled.${config.name}.js`,
      sourceMapConfig: { enabled: false }
    });

    return mergeTrees([bareTree, polyfilledLibTree]);
  });

  const nodeTree = funnel(sourceTree(pathConfig, 'commonjs'), {
    srcDir: '.',
    destDir: './node-lib'
  });

  if (env.production) {
    trees.push(uglifyJavaScript(funnel(trees, {
      getDestinationPath: function (path) {
        return path.replace(/\.js/, '.min.js');
      }
    })));
  }

  return mergeTrees([nodeTree, loaderTree, polyfillTree, new Licenser([
    new Versioner(trees, { templateString: '{{versionString}}' })
  ])]);
};
