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

const BUFFER_LOADED_FLAG = "__conkeror_loaded_buffer";

{
    const callbacks = [ ];

    const add_dom_content_loaded_hook = function (callback) {
        callbacks.push(callback);
    };

    add_hook("buffer_dom_content_loaded_hook", function (buffer, event) {
        if (!(BUFFER_LOADED_FLAG in buffer.top_frame) &&
            event.target.documentURI == buffer.top_frame.location) {
            buffer.top_frame[BUFFER_LOADED_FLAG] = true;
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
            const vars = site_vars[name](buffer);
            for (let vname in vars) {
                if (/^[\w$]+$/.test(vname) && !/^[0-9]/.test(vname)) {
                    f += ", " + vname;
                    args.push(vars[vname]);
                } else {
                    dumpln("Ignoring invalid site variable \"" + vname + "\" registered by " + name);
                }
            }
        }
        f += ") { try { eval(content) } catch (e) { dumpln('Error evaluating site file ' + file + ': ' + e) } })";
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
