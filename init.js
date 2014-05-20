(function () {

    const rcdir   = make_file("/home/mcafee/conkrc");
    const modules = make_file("/home/mcafee/conkrc/modules");

    load_paths.unshift(make_uri(modules).spec);

    for (let file of js_iter(modules))
        require(file);

    for (let file of js_iter(rcdir))
        if (file.leafName != "init.js")
            load(file);

    function js_iter(dir) {
        const entries = dir.directoryEntries;
        while (entries.hasMoreElements()) {
            const entry = entries.getNext().QueryInterface(Ci.nsIFile);
            if (/\.js$/.test(entry.leafName))
                yield entry;
        }
    }

})();
