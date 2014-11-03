var fs = require('fs')
var nfs = require('node-fs')
var urlparse = require('url').parse
var urlresolve = require('url').resolve
var path = require('path')
var request = require('request')
var CS = require('coffee-script')
CS.register()
var Browser = require('../plain-zombie/zombie/src/zombie/')

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
function fetchBrowser(url) {
  console.log('Browsing '+url)
  pending = 0
  var browser = Browser.create()
  browser.visit(url, function () {
    browser.resources.forEach(function (resource) {
      if (resource && urlparse(resource.request.url).path) {
        var embed_url = urlresolve(url, resource.request.url)
        console.log('Resource '+embed_url)
	fetchObject(embed_url)
	pending += 1
      }
    })
    if (pending === 0) {
      nextURL()
    }
  })
}

function fetchObject(url) {
  var details = parse_url(url)

  // Create domain directory
  console.log('Creating directory '+get_directory(details))
  nfs.mkdir(get_directory(details), 0777, true, function () {})

  console.log('Fetching '+url)
  try {
    request.get({uri : url, followRedirect : true}).on('response', onResponse).on('error', function (err) { 
      console.log(err)
      done()
    })
  } catch (e) {
    console.log(e)
    done()
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
