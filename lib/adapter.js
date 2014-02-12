/**
 * Custom methods for working with the GitHub API
 *
 * Should eventually be pulled out into a fully supported GitHub
 * Waterline adapter so keep that in mind when adding methods.
 */

var request = require('request');

module.exports = (function () {

  // Adapter specific variables
  var endpoint = 'https://api.github.com/';

  /**
   * Helper Methods
   */

  /**
   * Used to parse links headers that look like:
   * Link: <https://api.github.com/user/repos?page=3&per_page=100>; rel="next",
   * <https://api.github.com/user/repos?page=50&per_page=100>; rel="last"
   *
   * @param {String} linksHeader - <link>; rel="next", <link>; rel="prev"
   */

  var parseLinks = function (linksHeader) {
    var result = {};
    var entries = linksHeader.split(',');

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i].trim();
      var key = /rel="(.*)"/.exec(entry)[1];
      var source = /^<(.*)>/.exec(entry)[1];
      result[key] = source;
    }

    return result;
  };

  /**
   * Make github api call, recursing pagination before returning
   *
   * @param {String} method (either a url or path based on endpoint)
   * @param {String} token GitHub api oAuth access token
   * @param {Function} callback
   * @param {Integer} page - optional, used for recursion
   */
  var getRequest = function (method, token, cb, page) {
    page = page || 1;

    // If passed in a url, use that, otherwise construct it
    var url = method.indexOf('http') !== -1 ? method :
              endpoint + method + '?access_token=' + token + '&per_page=100&page=' + page;

    var opts = {
      url: url,
      method: 'get',
      headers: {
        'User-Agent': 'Sails GitHub Adapter',
        'Accept': 'application/json'
      }
    };

    request(opts, function (err, res, body) {
      if (err) return cb(err);
      if (res.statusCode !== 200) return cb(new Error('Invalid Response'));

      var data;

      // Attempt to parse the JSON reponse
      try {
        data = JSON.parse(body);
      } catch (e) {
        return cb(e);
      }

      // Deal with pagination
      var links = res.headers.link && parseLinks(res.headers.link);
      if (links && links.next) {

        // Recursively call until on the last page
        getRequest(links.next, null, function (err, next) {
          if (err) return cb(e);
          return cb(null, data.concat(next));
        }, page + 1);

      } else {
        return cb(null, data);
      }
    });

  };

  /**
   * Autmatically makes github api requests based on a 'path', filled by user parameters
   *
   * paths should have a unique number of optional parameters (denoted by a ':')
   * there are 3 non-optional parameters, which must be provided like so:
   *   model, ... , accessToken, callback
   * where ... indicates optional parameters which are mapped to the path
   *
   * @param {Array} paths
   */

  function route(paths) {
    return function () {
      var args = Array.apply([], arguments);
      var model = args.shift();
      var cb = args.pop();
      var accessToken = args.pop();

      if (typeof model === 'undefined' || !cb || !accessToken) {
        return cb && cb(new Error('either model, callback, or accessToken was not specified'));
      }

      for (var i = 0; i < paths.length; i++) {
        var path = paths[i];
        var colons = path.match(/:/g);
        var numVars = colons ? colons.length : 0;
        if (numVars === args.length) {
          var method = path.split('/').map(function (part) {
            if (part.indexOf(':') !== -1) {
              return args.shift();
            }
            return part;
          }).join('/');

          return getRequest(method, accessToken, cb);
        }
      }

      return cb(new Error('incorrect number of parameters specified, must follow one of ' +
                          'the following: ' + paths));
    };
  }



  /**
   * GitHub Adapter Methods
   */

  var adapter = {

    // Set Identity, for testing
    identity: 'github',

    /**
     * Register Collection, required by Waterline
     * currently a noop.
     */

    registerCollection: function (name, cb) {
      return cb();
    },

    /**
     * GitHub mapped API calls
     *
     * additional parameters for each method should be added between 'model' and 'accessToken'
     * additional parameters are defined by the route, any path part with a ':' indicates a user ovewritten variable
     * user params will automatically be mapped to the correct route based on length of optional arguments
     *
     * @param {Object} model
     * @param {String} accessToken
     * @param {Function} callback
     */

    getUser: route(['user', 'users/:user']),

    getUserOrgs: route(['user/orgs', 'users/:user/orgs']),

    getUserRepos: route(['user/repos', 'users/:user/repos']),

    getOrgRepos: route(['orgs/:org/repos']),

    getRepoContents: route(['repos/:owner/:repo/contents/:path']),

    getRepoBranches: route(['repos/:owner/:repo/branches'])

  };

  return adapter;
})();
