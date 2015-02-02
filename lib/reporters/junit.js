/*!
 * Nodeunit
 * Copyright (c) 2010 Caolan McMahon
 * MIT Licensed
 */

/**
 * Module dependencies
 */

var nodeunit = require('../nodeunit'),
    utils = require('../utils'),
    fs = require('fs'),
    path = require('path'),
    async = require('../../deps/async'),
    AssertionError = require('assert').AssertionError,
    child_process = require('child_process'),
    ejs = require('../../deps/ejs');


/**
 * Reporter info string
 */

exports.info = "jUnit XML test reports";


/**
 * Ensures a directory exists using mkdir -p.
 *
 * @param {String} path
 * @param {Function} callback
 * @api private
 */

var ensureDir = function (path, callback) {
    var mkdir = child_process.spawn('mkdir', ['-p', path]);
    mkdir.on('error', function (err) {
        callback(err);
        callback = function(){};
    });
    mkdir.on('exit', function (code) {
        if (code === 0) callback();
        else callback(new Error('mkdir exited with code: ' + code));
    });
};


/**
 * Returns absolute version of a path. Relative paths are interpreted
 * relative to process.cwd() or the cwd parameter. Paths that are already
 * absolute are returned unaltered.
 *
 * @param {String} p
 * @param {String} cwd
 * @return {String}
 * @api public
 */

var abspath = function (p, /*optional*/cwd) {
    if (p[0] === '/') return p;
    cwd = cwd || process.cwd();
    return path.normalize(path.resolve(p));
};


/**
 * Run all tests within each module, reporting the results to the command-line,
 * then writes out junit-compatible xml documents.
 *
 * @param {Array} files
 * @api public
 */

exports.run = function (files, options, callback) {
    options = utils.combineOptions(options);

    var log = options.log || console.log;

    var returnResult = function(result) {
        if(callback) {
            callback(result);
        }
    };

    if (!options.output) {
        returnResult(new Error(
            'Error: No output directory defined.\n' +
            '\tEither add an "output" property to your nodeunit.json config ' +
            'file, or\n\tuse the --output command line option.'
        ));
        return;
    }
    options.output = abspath(options.output);
    var error = function (str) {
        return options.error_prefix + str + options.error_suffix;
    };
    var ok    = function (str) {
        return options.ok_prefix + str + options.ok_suffix;
    };
    var bold  = function (str) {
        return options.bold_prefix + str + options.bold_suffix;
    };

    var start = new Date().getTime();

    var modules = {};
    var curModule;

    var opts = {
        testspec: options.testspec,
        testFullSpec: options.testFullSpec,
        moduleStart: function (name) {
            curModule = {
                errorCount: 0,
                failureCount: 0,
                tests: 0,
                testcases: [],
                name: name
            };
            modules[name] = curModule;
        },
        testDone: function (name, assertions) {
            var testcase = {name: name};
            for (var i=0; i<assertions.length; i++) {
                var a = assertions[i];
                if (a.failed()) {
                    a = utils.betterErrors(a);
                    testcase.failure = {
                        message: a.message,
                        backtrace: a.error.stack
                    };

                    if (a.error instanceof AssertionError) {
                        curModule.failureCount++;
                    }
                    else {
                        curModule.errorCount++;
                    }
                    break;
                }
            }
            curModule.tests++;
            curModule.testcases.push(testcase);
        },
        done: function (assertions) {
            var end = new Date().getTime();
            var duration = end - start;

            ensureDir(options.output, function (err) {
                var tmpl = __dirname + "/../../share/junit.xml.ejs";
                fs.readFile(tmpl, function (err, data) {
                    if (err) throw err;
                    var tmpl = data.toString();
                    for(var k in modules) {
                        var module = modules[k];
                        var rendered = ejs.render(tmpl, {
                            locals: {suites: [module]}
                        });
                        var filename = path.resolve(
                            options.output,
                            module.name + '.xml'
                        );
                        log('Writing ' + filename);
                        fs.writeFileSync(filename, rendered, 'utf8');
                    }
                    if (assertions.failures()) {
                        log(
                            '\n' + bold(error('FAILURES: ')) +
                            assertions.failures() + '/' +
                            assertions.length + ' assertions failed (' +
                            assertions.duration + 'ms)'
                        );
                    }
                    else {
                        log(
                            '\n' + bold(ok('OK: ')) + assertions.length +
                            ' assertions (' + assertions.duration + 'ms)'
                        );
                    }

                    returnResult(assertions.failures() ? new Error('We have got test failures.') : undefined);
                });
            });
        }
    };

    if (files && files.length) {
        var paths = files.map(function (p) {
            return path.resolve(p);
        });
        nodeunit.runFiles(paths, opts);
    } else {
        nodeunit.runModules(files, opts);
    }
};
