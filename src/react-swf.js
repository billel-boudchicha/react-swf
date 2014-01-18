/**
 * Copyright (c) 2014 Andreas Svensson
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/* jshint -W040 */
/*global ActiveXObject: false, define: false */

'use strict';


(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['react'], factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like enviroments that support module.exports,
    // like Node.
    module.exports = factory(require('react'));
  } else {
    // Browser globals (root is window)
    root.ReactSWF = factory(root.React);
  }
}(this, function (React) {

  function shallowEqual(objA, objB) {
    if (objA !== objB) {
      var key;
      for (key in objA) {
        if (objA.hasOwnProperty(key) &&
            (!objB.hasOwnProperty(key) || objA[key] !== objB[key])) {
          return false;
        }
      }
      for (key in objB) {
        if (objB.hasOwnProperty(key) && !objA.hasOwnProperty(key)) {
          return false;
        }
      }
    }
    return true;
  }


  var cachedFPVersion;

  var encodeFlashKeyValueRegex = /[\r%&+]/g;
  var encodeFlashKeyValueLookup = {
    '\r': '%0D', '%': '%25', '&': '%26', '+': '%2B'
  };

  var objectParamNames = {
    'play': true, 'loop': true, 'menu': true, 'quality': true, 'scale': true,
    'align': true, 'salign': true, 'bgColor': true, 'wmode': true, 'base': true,
    'allowScriptAccess': true, 'allowFullScreen': true,
    'fullScreenAspectRatio': true
  };

  var nextUniqueSWFID = 0;


  function encodeFlashKeyValueEncoder(match) {
    return encodeFlashKeyValueLookup[match];
  }

  function encodeFlashKeyValue(string) {
    // Encode \r or it may be normalized into \n
    return ('' + string).replace(
      encodeFlashKeyValueRegex,
      encodeFlashKeyValueEncoder
    );
  }

  function encodeFlashVarsObject(obj) {
    // Pushing encoded key-values to an array instead of immediately
    // concatenating is faster and scales better with large values.
    var list = [];

    for (var key in obj) {
      if (obj[key] !== null) {
        list.push(
          encodeFlashKeyValue(key) + '=' +
          encodeFlashKeyValue(obj[key])
        );
      }
    }

    return list.join('&');
  }

  function cleanupObjectIE8(node) {
    for (var key in node) {
      if (typeof node[key] === 'function') {
        node[key] = null;
      }
    }
  }

  /**
   * Detect installed Flash Player version. Result is cached.
   *
   * @return {?string} 'X.Y.Z'-version, or null.
   */
  function getFPVersion() {
    if (cachedFPVersion === undefined) {
      cachedFPVersion = null;

      if (navigator.plugins) {
        var plugin = navigator.plugins['Shockwave Flash'];
        if (plugin) {
          var mimeType = navigator.mimeTypes['application/x-shockwave-flash'];
          if (mimeType && mimeType.enabledPlugin) {
            var matches = plugin.description
              .match(/^Shockwave Flash (\d+)(?:\.(\d+))?(?: r(\d+))?/);

            cachedFPVersion =
              matches[1] + '.' + (matches[2] || 0) + '.' + (matches[3] || 0);
          }
        }
      }
      if (window.ActiveXObject) {
        try {
          var axObject = new ActiveXObject('ShockwaveFlash.ShockwaveFlash');
          if (axObject) {
            cachedFPVersion = axObject.GetVariable('$version')
              .match(/^WIN (\d+),(\d+),(\d+)/).slice(1).join('.');
          }
        }
        catch (e) {}
      }
    }

    return cachedFPVersion;
  }

  /**
   * Detect if installed Flash Player version meets requirements.
   *
   * @param {string} version 'X.Y.Z' or 'X.Y' or 'X'-version.
   * @return {boolean} True if version is supported.
   */
  function isFPVersionSupported(version) {
    var supportedVersion = getFPVersion();

    if (supportedVersion === null) {
      return false;
    }

    var supportedVersionArray = supportedVersion.split('.');
    var requiredVersionArray = version.split('.');

    for (var i = 0; i < requiredVersionArray.length; i++) {
      if (+supportedVersionArray[i] > +requiredVersionArray[i]) {
        return true;
      }
      if (+supportedVersionArray[i] < +requiredVersionArray[i]) {
        return false;
      }
    }

    return true;
  }

  var ReactSWF = React.createClass({
    statics: {
      getFPVersion: getFPVersion,
      isFPVersionSupported: isFPVersionSupported
    },
    getInitialState: function() {
      return {};
    },
    shouldComponentUpdate: function(nextProps) {
      return !shallowEqual(this.props, nextProps);
    },
    componentWillMount: function() {
      var props = this.props;
      var params = {};

      // IE8 requires the use of the movie param to function
      params['movie'] = props.src;

      for (var key in props) {
        if (objectParamNames[key]) {
          params[key] = props[key];
        }
      }

      var flashVars = props.flashVars;
      if (flashVars != null) {
        params['flashvars'] = typeof flashVars === 'string' ?
          flashVars :
          encodeFlashVarsObject(flashVars);
      }

      this.setState({
        id: nextUniqueSWFID++,
        src: props.src,
        params: params
      });
    },
    componentWillUnmount: function() {
      // IE8: leaks memory if all ExternalInterface-callbacks have not been
      // removed. Only IE implements readyState, hasOwnProperty does not exist
      // for DOM nodes in IE8, but does in IE9+.
      if (document.readyState !== undefined &&
          document.hasOwnProperty === undefined) {
        cleanupObjectIE8(this.getDOMNode());
      }
    },
    render: function() {
      var state = this.state;
      var params = [];

      for (var key in state.params) {
        params.push(
          React.DOM.param({
            key: key,
            name: key,
            value: state.params[key]
          })
        );
      }

      // flash.external.ExternalInterface.addCallback requires a unique id
      return this.transferPropsTo(
        React.DOM.object({
          type: 'application/x-shockwave-flash',
          id: '__react_swf_' + state.id,
          //key: this.props.src,
          data: state.src
        }, params)
      );
    }
  });

  return ReactSWF;

}));