/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
"use strict";
var EXPORTED_SYMBOLS = ["slLauncher"];

const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import('resource://slimerjs/addon-sdk/toolkit/loader.js'); //Sandbox, Require, main, Module, Loader
Cu.import('resource://slimerjs/slConsole.jsm');

var sandbox = null;
var mainLoader = null;

var slLauncher = {
    launchMainScript: function (contentWindow, scriptFile) {
        sandbox = Cu.Sandbox(contentWindow,
                            {
                                'sandboxName': 'slimerjs',
                                'sandboxPrototype': contentWindow,
                                'wantXrays': true
                            });

        // import the slimer/phantom API into the sandbox
        Cu.import('resource://slimerjs/slimer.jsm', sandbox);
        Cu.import('resource://slimerjs/phantom.jsm', sandbox);

        sandbox.console = new slConsole();

        // load and execute the provided script
        let fileURI = Services.io.newFileURI(scriptFile).spec;
        let dirURI =  Services.io.newFileURI(scriptFile.parent).spec;
        mainLoader = prepareLoader(fileURI, dirURI);

        try {
            Loader.main(mainLoader, 'main', sandbox);
        }
        catch(e) {
            if (sandbox.phantom.onError) {
                let [msg, stackRes] = getTraceException(e, fileURI);
                sandbox.phantom.onError(msg, stackRes);
            }
            else
                throw e;
        }
    },

    injectJs : function (source, uri) {
        let sandbox = mainLoader.sandboxes[mainLoader.main.uri];

        let evalOptions =  {
          version : mainLoader.javascriptVersion,
          source: source
        }
        Loader.evaluate(sandbox, uri, evalOptions);
    },
    /**
     * the XUL elements containing all opened browsers
     * @var DOMElement
     */
    browserElements : null,

    /**
     * create a new browser element. call the given callback when it is ready,
     * with the browser element as parameter.
     */
    openBrowser : function(callback, currentNavigator) {
        let browser = currentNavigator;
        if (!currentNavigator) {
            browser = this.browserElements.ownerDocument.createElement("webpage");
        }
        function onReady(event) {
            browser.removeEventListener("BrowserReady", onReady, false);
            callback(browser);
        }
        browser.addEventListener("BrowserReady", onReady, false);
        if (!currentNavigator)
            this.browserElements.appendChild(browser);
        this.browserElements.selectedPanel = browser;
    },

    closeBrowser: function (navigator) {
        //navigator.resetBrowser();
        navigator.parentNode.removeChild(navigator);
        this.browserElements.selectedPanel = this.browserElements.lastChild;
    }
}


function prepareLoader(fileURI, dirURI) {
    var metadata ={
            permissions : {}
    };

    return Loader.Loader({
        javascriptVersion : 'ECMAv5',
        id:'slimerjs@innophi.com',
        name: 'SlimerJs',
        rootURI: dirURI,
        metadata: Object.freeze(metadata),
        paths: {
          'main': fileURI,
          '': dirURI,
          'sdk/': 'resource://slimerjs/addon-sdk/sdk/',
          'webpage' : 'resource://slimerjs/slimer-sdk/webpage',
          'net-log' : 'resource://slimerjs/slimer-sdk/net-log'
        },
        globals: {
            console: new slConsole()
        },
        modules: {
          "webserver": Cu.import("resource://slimerjs/webserver.jsm", {}),
          "system": Cu.import("resource://slimerjs/system.jsm", {}),
        },
        resolve: function(id, requirer) {
            // we have some aliases, let's resolve them
            if (id == 'fs') {
                return 'sdk/io/file';
            }
            if (id == 'chrome' || id.indexOf('@loader/') === 0) {
                if (requirer.indexOf('sdk/') === 0
                    || requirer == "webpage"
                    || requirer == "net-log") {
                    return id;
                }
                // the chrome module is only allowed in embedded modules
                if (id == 'chrome') {
                    throw Error("Module "+ requirer+ " is not allowed to require the chrome module");
                }
                else if (id.indexOf('@loader/') === 0)
                    throw Error("Unknown "+ id +" module");
            }
            // let's resolve other id module as usual
            let paths = id.split('/');
            let result = requirer.split('/');
            result.pop();
            while (paths.length) {
              let path = paths.shift();
              if (path === '..')
                result.pop();
              else if (path !== '.')
                result.push(path);
            }
            var finalpath = result.join('/');
            return finalpath;
        }
    });
}
