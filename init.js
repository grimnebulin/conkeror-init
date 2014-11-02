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
//  matching name is loaded and executed.  The following variables are
//  available to these files:
//
//    buffer - The page's buffer object.
//
//    $ - a jQuery object for the page.
//
//    autoload_disqus_comments - A function which, when called,
//    arranges for all Disqus comments on the page to be loaded
//    automatically.
//
//  Sites files are re-loaded every time a matching page is loaded, so
//  changes to the code are reflected on the next page-load.  However,
//  the sites directory is only re-scanned when the interactive
//  command "reload-sites" is executed.  New site files will not be
//  noticed until this is done.

(function (do_eval) {

    function new_relative_file(src, path) {
        const copy = src.clone();
        copy.appendRelativePath(path);
        return copy;
    }

    const rcdir   = new_relative_file(get_home_directory(),  "conkrc");
    const modules = new_relative_file(rcdir, "modules");
    const sitedir = new_relative_file(rcdir, "sites");

    load_paths.unshift(make_uri(modules).spec);

    for (let file of js_iter(modules))
        require(file);

    for (let file of js_iter(rcdir))
        if (file.leafName != "init.js")
            load(file);

    const sites = [ ];

    function load_sites() {
        let i = 0;
        for (let file of js_iter(sitedir))
            sites[i++] = file;
        sites.length = i;
    }

    load_sites();

    interactive("reload-sites", "Reload sites directory", load_sites);

    add_dom_content_loaded_hook(function (buffer) {
        for (let file of sites_matching(buffer.current_uri.asciiHost)) {
            read_file(file, function (content) {
                try {
                    do_eval($$(buffer), buffer, content);
                } catch (e) {
                    dumpln("Error evaluating site file " +
                           file.leafName + ": " + e);
                }
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
            if (host == name || host.endsWith("." + name))
                yield file;
        }
    }

    Components.utils.import("resource://gre/modules/NetUtil.jsm");

    function read_file(file, callback) {
        NetUtil.asyncFetch(file, function (stream, status) {
            if (Components.isSuccessCode(status)) {
                const content = NetUtil.readInputStreamToString(
                    stream, stream.available()
                );
                callback(content);
            }
        });
    }

})(
    function ($, buffer, str) {
        try {
            let (
                autoload_disqus_comments = function () {
                    buffer.top_frame.__autoload_disqus_comments =
                        arguments.length > 0 ? arguments[0] : true;
                }
            )
            eval(str);
        } catch (e) {
            dumpln(e);
        }
    }
);
