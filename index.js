
/**
 *
 * @module
 * @author vega <vegawong@126.com>
 **/

/* eslint-disable no-use-before-define */

const fs = require('fs');
const path = require('path');
const containsPath = require('contains-path');
const webpack = require('webpack');
const rimraf = require('rimraf');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const getBaseConfig = require('./src/baseConfig');
const defaultOpts = require('./src/defaultOptions');
const getPkg = require('./src/getPackage');
const getLoaderSetting = require('./src/loaderSetting');

const cwd = process.cwd();

module.exports = function (opts) {
  checkRequired(opts);
  // entry字段处理
  if (typeof opts.in === 'string') {
    defaultOpts.entry = path.resolve(opts.in);
  } else if (Array.isArray(opts.in)) {
    defaultOpts.entry = opts.in.map(item => path.resolve(item));
  } else if (typeof opts.in === 'object') {
    defaultOpts.entry = {};
    Object.keys(opts.in).forEach(item => {
      defaultOpts.entry[item] = path.resolve(opts.in[item]);
    });
  } else {
    throw new Error('options.in is inValid');
  }

  // output字段处理
  let outputFolder;
  if (typeof opts.out === 'string') {
    outputFolder = path.resolve(opts.out);
    defaultOpts.output = {
      path: `${outputFolder}/`,
      filename: null,
      cssFilename: null,
      publicPath: '/'
    };
  } else if (typeof opts.out === 'object') {
    outputFolder = path.resolve(opts.out.path || './dist');
    defaultOpts.output = {
      path: `${outputFolder}/`,
      filename: null,
      cssFilename: null,
      publicPath: opts.out.publicPath || '/'
    };
  }

  const spec = Object.assign({}, defaultOpts, opts);

  const pkg = getPkg(spec.package);

  if (!spec.output.filename) {
    spec.output.filename = spec.isDev ? '[name].js' : buildFilename(pkg, spec.hash, 'js');
  }
  if (!spec.output.cssFilename) {
    spec.output.cssFilename = spec.isDev ? '[name].css' : buildFilename(pkg, spec.hash, 'css');
  }

  const config = getBaseConfig(spec);
  const loaders = getLoaderSetting(spec);
  // Add optional loaders
  loaders.forEach(item => {
    config.module.loaders.push(item);
  });
  // check for any module replacements
  if (spec.replace) {
    for (const item in spec.replace) {
      // allow for simple strings
      if (typeof item === 'string') {
        var regex = new RegExp(`^${item}$`);
      }
      let newResource = spec.replace[item];
      if (typeof newResource === 'string') {
        newResource = path.resolve(newResource);
      }
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(regex, newResource));
    }
  }

  // check for any module definitions
  if (spec.define) {
    config.plugins.push(new webpack.DefinePlugin(spec.define));
  }


  // dev specific stuff
  if (spec.isDev) {
    // debugging option
    // https://webpack.github.io/docs/configuration.html#devtool
    // https://github.com/HenrikJoreteg/hjs-webpack/issues/63
    // Supports original code (before transforms) with pretty good initial
    // build speed and good rebuild speed
    config.devtool = spec.devtool || 'cheap-module-eval-source-map';

    // Create our dev server config for use in bin/hjs-dev-server
    // config.devServer = defaults(spec.devServer, {
    //   // For webpack-dev-middleware
    //   noInfo: true,
    //   quiet: false,
    //   lazy: false,
    //   publicPath: spec.output.publicPath,
    //   // Our own options for hjs-dev-server
    //   historyApiFallback: true,
    //   hot: true,
    //   contentBase: outputFolder,
    //   port: spec.port,
    //   https: spec.https,
    //   hostname: spec.hostname || spec.host
    // })

    // Enable Webpack HMR unless explictly disabled
    // if (config.devServer.hot) {
    //   installedHotLoaders.load(config)
    // }

    // Add visualizer plugin
    // if (isInstalled('webpack-visualizer-plugin')) {
    //   config.plugins.push(
    //     new (require('webpack-visualizer-plugin'))()
    //   )
    // }
  } else {
    // clear out output folder if so configured
    if (spec.clearBeforeBuild) {
      // Throw error if trying to clear output directory but it contains the cwd
      // See https://github.com/HenrikJoreteg/hjs-webpack/issues/186
      if (containsPath(cwd, outputFolder)) {
        throw new Error(`Cannot clear out directory since it contains the current working directory.\nTried to clear ${outputFolder} from ${cwd}`);
      }

      // allow passing a glob (limit to within folder though)
      if (typeof spec.clearBeforeBuild === 'string') {
        // create the output folder if it doesn't exist
        // just for convenience
        if (!fs.existsSync(outputFolder)) {
          fs.mkdirSync(outputFolder);
        }
        rimraf.sync(`${outputFolder}/${spec.clearBeforeBuild}`);
      } else {
        rimraf.sync(outputFolder);
        fs.mkdirSync(outputFolder);
      }
    }

    // minify in production
    config.plugins.push(
      new webpack.optimize.DedupePlugin(),
      new webpack.optimize.OccurenceOrderPlugin(true),
      new webpack.optimize.UglifyJsPlugin(spec.uglify),
      new ExtractTextPlugin(config.output.cssFilename, {
        allChunks: true
      }),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': '"production"'
      })
    );
  }

  return config;
};


function buildFilename(pack, hash, ext) {
  const hashIsNum = typeof hash === 'number';
  const hashCount = hashIsNum ? `:${hash}` : '';

  return [
    '[name]',
    // extract-text-plugin uses [contenthash] and webpack uses [hash]
    hash ? (ext === 'css' ? `[contenthash${hashCount}]` : `[chunkhash${hashCount}]`) : pack.version,
    ext || 'js'
  ].join('.');
}


function checkRequired(opts) {
  const props = ['out', 'in'];
  if (!opts || !props.every(prop => opts.hasOwnProperty(prop))) {
    throw new Error('Must pass in options object with `in` and `out` properties');
  }
}