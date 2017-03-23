# SUMMARY

`conkeror-init` provides a framework for defining and loading discrete
Conkeror packages when Conkeror is started.

The `init.js` file in this package is intended to be used as a
`~/.conkerorrc` file, such as by being symlinked to from that
location.  It provides a number of generally-useful features, and
examines the environment variable `CONKEROR_PACKAGES` to locate
additional features to load.

# PACKAGES

A Conkeror "package" is a directory containing zero or more Javascript
source files (indentified by a `".js"` suffix), and, optionally, a
"modules" subdirectory and/or a "sites" subdirectory.

When `init.js` is executed, the environment variable
`CONKEROR_PACKAGES`, if set, is split on colon characters (`":"`) into
a list of directories, and each directory is "imported," if possible.

When a package is imported, these things happen:

- If a "modules" subdirectory is present, it is added to the Conkeror
  `load_paths` array, and every Javascript source file inside it is
  loaded with Conkeror's `require` function.
  
- Every Javascript source file in the main package directory is
  loaded with Conkeror's `load` function.
  
- The "sites" subdirectory, if one exists, is registered as a "sites
  directory", and every Javascript source file inside it is registered
  as a "site file."
  
## SITES

A "site file" is a file whose name is an Internet domain name followed
by `".js"`--for example, `google.com.js` or `www.linkedin.com.js`.

Whenever a page is loaded, every registered site file whose name
matches the page's domain is loaded and evaluated.  A site file's name
matches a domain if the file's name, stripped of its `.js` suffix, is
the same as the domain name or is a subdomain of the domain.  For
example, the site file `google.com.js` would be evaluated when
visiting `google.com`, `drive.google.com`, or `calendar.google.com`,
and the site file `www.linkedin.com.js` would be evaluated when
visiting `www.linkedin.com` but not `linkedin.com`.

Site files are reloaded and re-evaluated each time a site is visited,
so modifications to site files take effect immediately--Conkeror need
not be restarted.  However, site directories are *not* re-scanned
every time a page is visited.  The interactive command `reload-sites`
is provided to manually rescan all site directories.  This will
register new site files and unregister deleted site files.

When a site file is evaluated, the variable `buffer` is set to the
Conkeror buffer which is visiting the site.  Additional variables may
be made available to site files by using the following function.

- `register_site_variables(name, callback)`

  Register `callback` as a function to call when a site file is
  loaded.  `name` is an arbitrary name for the callback; if
  `register_site_variables` is called multiple times with the same
  `name`, only the last one is retained.
  
  `callback` will be called with one argument, the buffer object
  visiting the current page.  It should return an object.  For each
  key-value pair in the object, a variable with that name and value
  will be made available to each site file when it is evaluated.  For
  example, the
  [conkeror-jquery](https://github.com/grimnebulin/conkeror-jquery)
  package registers the variable `$` as a jQuery object for the
  current buffer's HTML content.
  
  Only names in the returned object that look like Javascript variable
  names (that is, they consist only of `$` characters or characters
  that match the `\w` regular expression class, and do not begin with
  a digit) will be made available to site files.  Other names will be
  ignored.
  
