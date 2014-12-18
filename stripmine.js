var fs = require('fs')
var nfs = require('node-fs')
var urlparse = require('url').parse
var urlresolve = require('url').resolve
var path = require('path')
var request = require('request')
var CS = require('coffee-script')
CS.register()
var Browser = require('zombie')

var argv = require('minimist')(process.argv.slice(2))
if (argv.h || argv._.length != 2) {
  console.log('USAGE: node client.js <url_file> <output_dir>')
  console.log('-h print this help menu')
  process.exit()
}
url_file = argv._[0]
out_dir = argv._[1]

function parse_url(url) {
  var details = urlparse(url)
  if (path.extname(details.pathname)) {
    details.filename = path.basename(details.pathname)
    details.directory = path.dirname(details.pathname)
  } else {
    details.filename = 'index.html'
    details.directory = details.pathname
  }
  return details
}

function get_directory(details) {
  return path.join(path.join(out_dir,details.host), details.directory)
}

function get_filename(details) {
  return path.join(get_directory(details), details.filename)
}

var pending = 0
var reqs = []
function fetchBrowser(url) {
  console.log('Browsing '+url)
  pending = 0
  var browser = Browser.create()
  browser.waitDuration = '10s'
  browser.features = 'scripts css img iframe'
  browser.on('request', function(req) {
    // Prevent duplicates
    if (reqs.indexOf(req.url) !== -1) {
      return
    }
    reqs.push(req.url)

    fetchObject(req.url)
  })

  browser.on('redirect', function(req, res, red) {
    // Prevent duplicates
    if (reqs.indexOf(red.url) !== -1) {
      return
    }
    reqs.push(red.url)

    fetchObject(red.url)
  })

  browser.visit(url, function () {
    if (pending === 0) {
      nextURL()
    }
  })
}

var dirs = []
function fetchObject(url) {
  console.log('Resource '+url)
  pending += 1
  var details = parse_url(url)

  // If file exists, do not fetch
  fs.stat(get_filename(details), function (err, stats) {
    if (err) {
      createDirectory()
    } else {
      done()
    }
  })

  function createDirectory() {
    // Create domain directory
    if (dirs.indexOf(get_directory(details)) === -1) {
      dirs.push(get_directory(details))

      console.log('Creating directory '+get_directory(details))
      nfs.mkdir(get_directory(details), 0777, true, function (err) {
        if (err) console.log(err)
        onDirectory()
      })
    } else {
      onDirectory()
    }
  }

  function onDirectory() {
    console.log('Fetching '+url)
    try {
      request.get({ uri : url, followRedirect : false, timeout : 5000 }).on('response', onResponse).on('error', function (err) { 
        console.log(err)
        done()
      })
    } catch (e) {
      console.log(e)
      done()
    }
  }

  function onResponse(response) {
    // Write response object to file
    var wfile = fs.createWriteStream(get_filename(details))
    wfile.on('error', function(err) { console.log(err) })
    response.pipe(wfile)

    // Store the headers
    var data = {
  	responseCode : 	response.statusCode,
    	headers : 	response.headers
    }
    fs.writeFile(get_filename(details)+'.headers', JSON.stringify(data, null, '\t'), function (err) {
      if (err) console.log(err)
    })
    done()
  }
}

function done() {
  pending -= 1
  if (pending === 0)
    nextURL()
}

// Load the files
var urls = fs.readFileSync(url_file).toString().split('\n')
try {
  fs.mkdirSync(out_dir)
} catch (e) {
  console.log('Error creating output directory.')
}

var i = 0
// Fetch URLs one at a time
function nextURL() {
  if (i < urls.length) {
    fetchBrowser(urls[i])
    i += 1
  } else {
    process.exit()
  }
}

// Go
nextURL()
