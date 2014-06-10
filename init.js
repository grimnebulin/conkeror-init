(function (do_eval) {

    const rcdir   = make_file("/home/mcafee/conkrc");
    const modules = make_file("/home/mcafee/conkrc/modules");
    const sitedir = make_file("/home/mcafee/conkrc/sites");

    load_paths.unshift(make_uri(modules).spec);

    for (let file of js_iter(modules))
        require(file);

    for (let file of js_iter(rcdir))
        if (file.leafName != "init.js")
            load(file);

    const sites = [ ];

    function load_sites() {
        Array.prototype.splice.apply(
            sites, [ 0, sites.length ].concat(
                [ file for (file of js_iter(sitedir)) ]
            )
        );
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

})(function ($, buffer, str) { eval(str) });
