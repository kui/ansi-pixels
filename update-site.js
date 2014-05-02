// source files
var DATA_PATH = 'data'

// output files
var INDEX_PAGE_NAME = 'index.html'
var ENTRY_PAGE_NAME = 'entry/%s.svg'
var ENTRY_ANSI_NAME = 'entry/%s.dat'

// svg setting
var DOT_SIZE = 10; // px
var X_OFFSET = 1;
var Y_OFFSET = 1;

// html setting
var BASE_URL = 'http://kui.github.io/ansi-pixels';
var STYLE =
  'code { background-color: black; color: white; padding: 5px; }';

////////////////////////////////////////

'use strict';

// core lib
var path = require('path');
var fs = require('fs');
var util = require('util');
var readline = require('readline');

// 3rd party lib
var mkdirp = require('mkdirp');

// constants
var DEBUG = (process.env.DEBUG === 'true' );
var ABS_DATA_PATH = path.resolve(__dirname, DATA_PATH);
var ABS_INDEX_PAGE_NAME = path.resolve(__dirname, INDEX_PAGE_NAME);
var ABS_ENTRY_PAGE_NAME = path.resolve(__dirname, ENTRY_PAGE_NAME);
var ABS_ENTRY_ANSI_NAME = path.resolve(__dirname, ENTRY_ANSI_NAME);
var ANSI_COLORS = {
  '0': 'black', '1': 'red', '2': 'green', '3': 'yellow', '4': 'blue',
  '5': 'purple', '6': 'cyan', '7': 'white', '8': 'gray'
}

// functions

function main() {
  readEntries(function(entries) {
    buildIndexPage(entries);
    buildEntryPages(entries);
  });
}

function readEntries(callback) {
  fs.readdir(ABS_DATA_PATH, function(err, files) {
    if (err) throw err;

    files.sort();

    var entries = files.map(function(file) {
      return new Entry(path.resolve(ABS_DATA_PATH, file));
    });
    d(entries);
    callback(entries);
  });
}

function buildIndexPage(entries) {
  mkdirp(path.dirname(ABS_INDEX_PAGE_NAME), function(err) {
    if (err) throw err;
    var items = entries.map(function(e) {
      return util.format('<h3>%s</h3>\n' +
                         '<a href="%s"><img src="%s"></a><br>\n' +
                         '<code>curl -s %s</code>\n',
                         e.name, e.linkPath, e.linkPath, e.ansiLinkPath);
    }).join('');
    var html = util.format('<head>\n' +
                           '<style>%s</style>' +
                           '</head>\n' +
                           '<ul>\n%s</ul>', STYLE, items);

    dumpData(ABS_INDEX_PAGE_NAME, html);
  });
}

function buildEntryPages(entries) {
  entries.forEach(function(e) {
    buildEntryPage(e);
  });
}

function buildEntryPage(entry) {
  mkdirp(path.dirname(entry.outputPath), function(err) {
    if (err) throw err;

    createSvg(entry.sourcePath, function(svg) {
      dumpData(entry.outputPath, svg);
    });
    createAnsi(entry.sourcePath, function(ansi) {
      dumpData(entry.ansiPath, ansi);
    });
  });
}

function createSvg(sourcePath, callback) {
  var rects = ''
  var src = fs.createReadStream(sourcePath);
  var x = X_OFFSET, y = Y_OFFSET;
  var maxX = 0;

  src.setEncoding('utf-8');
  src.on('data', function(data) {
    data.split('').forEach(function(c) {
      if (c === ' ') {
        // no-op
        rects += '<!-- blank -->\n'
        x++;
      } else if (c === '\n') {
        if (maxX < x) maxX = x;

        rects += '\n'
        x = X_OFFSET;
        y++;
      } else {
        var color = ANSI_COLORS[c];
        if (!color) throw 'unknown code: ' + c;

        rects += util.format(
          '<rect x="%s" y="%s" width="%s" height="%s" fill="%s"/><!-- %s -->\n',
          x * DOT_SIZE, y * DOT_SIZE, DOT_SIZE, DOT_SIZE, color, c
        );
        x++;
      }
    });
  });
  src.on('end', function() {
    var height = (y + 1) * DOT_SIZE;
    var width = maxX * DOT_SIZE;
    var svg = util.format(
      '<svg xmlns="http://www.w3.org/2000/svg"\n' +
      '     width="%s"\n' +
      '     height="%s"\n' +
      '     >\n' +
      '%s' +
      '</svg>\n',
      width,
      height,
      rects
    );

    d('build svg: file=%s, width=%s, height=%s', sourcePath, width, height);
    callback(svg);
  });
}

function createAnsi(sourcePath, callback) {
  var body = ''
  var src = fs.createReadStream(sourcePath);

  src.setEncoding('utf-8');
  src.on('data', function(data) {
    data.split('').forEach(function(c) {
      if (c === ' ') {
        body += '  '
      } else if (c === '\n') {
        body += '\n'
      } else {
        body += util.format('\x1b[4%sm  \x1b[0m', c);
      }
    })
  });
  src.on('end', function() {
    body += '\n';
    callback(body);
  });
}

function dumpData(path, data) {
  fs.writeFile(path, data, function(err) {
    if (err) throw err;
    l('update %s', path);
  });
}

var l = console.log.bind(console);
var d = DEBUG ? console.log.bind(console) : function(){};

// class

var Entry = (function() {
  var _Entry = function(filePath) {
    this.sourcePath = filePath;
    this.name = createName(this.sourcePath);
    this.outputPath = createOutputPath(this.sourcePath);
    this.ansiPath = createAnsiPath(this.sourcePath);
    this.linkPath = createLinkPath(this.outputPath);
    this.ansiLinkPath = createAnsiLinkPath(this.ansiPath);
  };

  // public methods
  _Entry.prototype = {
    toString: function() {
      var attrs = [this.sourcePath, this.outputPath].map(function(a) {
        return util.format('"%s"', a);
      }).join(', ');
      return util.format('Entry(%s)', attrs);
    }
  };

  var createName = function(sourcePath) {
    return sourcePath
      .replace(new RegExp('^' + ABS_DATA_PATH), '')
      .replace(/^\//, '')
      .replace(/\.dat$/, '');
  };
  var createOutputPath = function(filePath) {
    return createFormatedPath(filePath, ABS_ENTRY_PAGE_NAME);
  };
  var createAnsiPath = function(filePath) {
    return createFormatedPath(filePath, ABS_ENTRY_ANSI_NAME);
  };
  var createFormatedPath = function(filePath, format) {
    var baseName = path.relative(ABS_DATA_PATH, filePath).replace(/\.dat$/, '');
    return util.format(format, baseName);
  };
  var createLinkPath = function(outputPath) {
    return outputPath.replace(new RegExp('^' + __dirname + '/'), '');
  };
  var createAnsiLinkPath = function(ansiPath) {
    return BASE_URL + ansiPath.replace(new RegExp('^' + __dirname), '');
  }

  return _Entry;
})();

main();
