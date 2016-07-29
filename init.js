"use strict";

// Copyright 2016 Sean McAfee

// This file is part of conkeror-init.

// conkeror-init is free software: you can redistribute it and/or
// modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// conkeror-init is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with conkeror-init.  If not, see
// <http://www.gnu.org/licenses/>.

//  The following code establishes a wrapper around
//  buffer_dom_content_loaded_hook that calls the hook functions only
//  one time per page, when the page's DOM content has been definitely
//  loaded.  (The basic hook can be called many times per page in
//  various circumstances.  Some of those calls may be related to
//  resources loaded by the page and may happen prior to the main
//  page's content being loaded.)
//
//  This wrapper depends on Conkeror passing the DOMContentLoaded
//  event object to our callback, which it doesn't ordinarily do; the
//  on-dom-loaded-provide-event.patch file in this directory must be
//  applied to Conkeror's source.

let (
    buffer_loaded_flag = "__conkeror_loaded_buffer",
    callbacks = [ ]
) {
    const add_dom_content_loaded_hook = function (callback) {
        callbacks.push(callback);
    };

    add_hook("buffer_dom_content_loaded_hook", function (buffer, event) {
        if (!(buffer_loaded_flag in buffer.top_frame) &&
            event.target.documentURI == buffer.top_frame.location) {
            buffer.top_frame[buffer_loaded_flag] = true;
            for (let callback of callbacks) {
                try {
                    callback(buffer);
                } catch (e) {
                    dumpln("dom-content-loaded callback failed: " + e);
                }
            }
        }
    });

}

//  A simple wrapper around add_dom_content_loaded_hook.  The
//  on_dom_loaded function takes a RegExp object and a callback; the
//  callback will be called whenever a page is loaded whose
//  originating host name matches the RegExp.  If the optional third
//  argument to on_dom_loaded is true, then the callback will be
//  called with the buffer object for the page; otherwise a jQuery
//  object will be passed.

let (tests = [ ]) {
    const on_dom_loaded = function (hostpat, callback, want_buffer) {
        tests.push([ hostpat, callback, want_buffer ]);
    };

    add_dom_content_loaded_hook(function (buffer) {
        const host = buffer.current_uri.asciiHost;
        for (let [hostpat, callback, want_buffer] of tests)
            if (hostpat.test(host))
                callback(want_buffer ? buffer : $$(buffer));
    });

}

//  This function returns a pair of functions that take care of some
//  of the boilerplate required to define a page mode.  The first
//  function in the returned list is a mode-enable function suitable
//  for passing as the third argument to Conkeror's built-in
//  define_page_mode function, and the second function is a
//  mode-disable function suitable for passing as the fourth argument
//  to define_page_mode.  MODALITY is as per Conkeror's built-in
//  define_page_mode function; the optional CLASSES is a mapping the
//  will be added to the buffer's default_browser_object_classes
//  object in the enable function and removed in the disable function.
//
//  Example of use:
//
//  let ([enable, disable] = setup_mode({ normal: foo_keymap }))
//    define_page_mode("foo-mode", /foo\.com/, enable, disable);

function setup_mode(modality, classes) {
    classes = classes || { };
    function enable(buffer) {
        buffer.content_modalities.push(modality);
        for (let [key, value] in Iterator(classes))
            buffer.default_browser_object_classes[key] = value;
    }
    function disable(buffer) {
        const i = buffer.content_modalities.indexOf(modality);
        if (i >= 0) buffer.content_modalities.splice(i, 1);
        for (let key in Iterator(classes, true))
            delete buffer.default_browser_object_classes[key];
    }
    return [ enable, disable ];
}

//  An implementation of a Maybe monad.
//
//  The maybe() function returns either a Some object if its argument
//  is anything other than null or undefined, and a None object
//  otherwise.
//
//  Originally based on https://gist.github.com/andyhd/1618403.

function maybe(value) {
    return value !== null && value !== undefined ? Some(value) : None();
}

function Some(value) {
    const obj = {
        map: f => maybe(f(value)),
        foreach: f => (f(value), obj),
        orElse: _ => obj,
        getOrElse: _ => value,
        get empty() false,
        get nonempty() true
    };
    return obj;
}

function None() {
    const obj = {
        map: _ => obj,
        foreach: _ => obj,
        orElse: f => f(),
        getOrElse: x => x,
        get empty() true,
        get nonempty() false
    };
    return obj;
}

function make_descriptors(data) {
    let out = "", err = "";
    const fds = [
        { output: async_binary_string_writer(data || "")  },
        { input:  async_binary_reader(s => out += s || "") },
        { input:  async_binary_reader(s => err += s || "") }
    ];
    return [ fds, () => out, () => err ];
}

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function WebRequest(url, callback, responseType) {
    let async = true;
    let headers = { };
    return {
        async: function (flag) { async = flag; return this },
        withHeader: function (name, value) { headers[name] = value; return this },
        responseType: function (newType) { responseType = newType; return this },
        start: function () {
            const req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                .createInstance(Ci.nsIXMLHttpRequest);
            req.open("GET", url, async);
            req.responseType = responseType !== undefined ? responseType : "text";
            req.onreadystatechange = function () {
                if (this.readyState == 4) {
                    callback(this.response);
                }
            };
            for (let header in headers) {
                req.setRequestHeader(header, headers[header]);
            }
            req.send(null);
        }
    };
}

//  This file is the main entry point for my Conkeror customizations.
//  It performs the following steps:
//
//  Adds the "modules" subdirectory to the module load path.
//
//  Loads all Javascript files in the "modules" subdirectory using
//  require().
//
//  Loads all Javascript files in this directory using load().
//
//  Records the names of all Javascript files in the "sites"
//  subdirectory.  Sets up a buffer-loaded hook that examines the
//  hosts from which a page was loaded; each sites file with a
//  matching name is loaded and executed.  The "buffer" variable is
//  made available when these files are evaluated, as well as any
//  variables registered via the register_site_variables function.
//
//  Sites files are re-loaded every time a matching page is loaded, so
//  changes to the code are reflected on the next page-load.  However,
//  the sites directory is only re-scanned when the interactive
//  command "reload-sites" is executed.  New site files will not be
//  noticed until this is done.

(function () {

    const PACKAGES_VAR = "CONKEROR_PACKAGES";

    function new_relative_file(src, path) {
        const copy = src.clone();
        copy.appendRelativePath(path);
        return copy;
    }

    const site_dirs = [ ];

    function new_file(path) {
        const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
        file.initWithPath(path);
        return file;
    }

    function import_package(dir) {
        const modules = new_relative_file(dir, "modules");
        if (is_readable_directory(modules)) {
            load_paths.unshift(make_uri(modules).spec);
            for (let file of js_iter(modules)) {
                require(file);
            }
        }
        for (let file of js_iter(dir)) {
            load(file); // How/whether to omit this init.js?
        }
        const sites = new_relative_file(dir, "sites");
        if (is_readable_directory(sites)) {
            site_dirs.push(sites);
        }
    }

    const site_vars = { };

    conkeror.register_site_variables = function (name, callback) {
        site_vars[name] = callback;
    };

    const env = Cc["@mozilla.org/process/environment;1"]
          .getService(Ci.nsIEnvironment);

    if (env.exists(PACKAGES_VAR)) {
        for (let dir of env.get(PACKAGES_VAR).split(/:/).map(new_file)) {
            if (is_readable_directory(dir)) {
                dumpln("Importing: " + dir.path);
                import_package(dir);
            }
        }
    }

    const sites = [ ];

    function load_sites() {
        let i = 0;
        for (let dir of site_dirs) {
            for (let file of js_iter(dir)) {
                sites[i++] = file;
            }
        }
        sites.length = i;
    }

    load_sites();

    interactive("reload-sites", "Reload site directories", load_sites);

    add_dom_content_loaded_hook(function (buffer) {
        let f = "(function (content, buffer";
        const args = [ buffer ];
        for (let name in site_vars) {
            const foo = site_vars[name](buffer);
            for (let name in foo) {
                if (/^[\w$]$/.test(name) && !/^[0-9]/.test(name)) {
                    f += ", " + name;
                    args.push(foo[name]);
                }
            }
        }
        f += ") { try { eval(content) } catch (e) { dumpln('Error evaluating site file ???') } })";
        const g = eval(f);
        for (let file of sites_matching(buffer.current_uri.asciiHost)) {
            read_file(file, function (content) {
                g.apply(null, [ content ].concat(args));
            });
        }
    });

    function js_iter(dir) {
        if (!dir.exists()) return;
        const entries = dir.directoryEntries;
        while (entries.hasMoreElements()) {
            const file = entries.getNext().QueryInterface(Ci.nsIFile);
            if (/\.js$/.test(file.leafName) && !file.isDirectory())
                yield file;
        }
    }

    function sites_matching(host) {
        for (let file of sites) {
            const name = file.leafName.substr(0, file.leafName.length - 3);
            if (host === name || host.endsWith("." + name))
                yield file;
        }
    }

    const scope = { };

    Components.utils.import("resource://gre/modules/NetUtil.jsm", scope);

    function read_file(file, callback) {
        scope.NetUtil.asyncFetch(file, function (stream, status) {
            if (Components.isSuccessCode(status)) {
                const content = scope.NetUtil.readInputStreamToString(
                    stream, stream.available()
                );
                callback(content);
            }
        });
    }

    function is_readable_directory(file) {
        return file.exists() && file.isReadable() && file.isDirectory();
    }

})();
