/*
 ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is MessageFaces extension.
 *
 * The Initial Developer of the Original Code is Jens Bannmann.
 * Portions created by the Initial Developer are Copyright (C) 2004
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s) (alphabetical order):
 *  Andrew Taylor <ataylor@its.to>
 *  Hans Christian Saustrup <hc@saustrup.net>
 *  Jens Bannmann <jens.b@web.de>
 *  John Duncan <duncjo01@gettysburg.edu>
 *  Jonas Eckerman <jonas@truls.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 *
 ***** END LICENSE BLOCK *****
 */
// picon database folders
var mfPiconDatabases = new Array("domains", "users", "misc", "usenix", "unknown");
// file extensions for local FACE lookups
var mfFileExtensions = new Array("jpg", "png", "gif");

var mfPref;
var mfGravatarEnabled;
var mfGravatarEnableCache;
var mfGravatarURL;
var mfXFaceUseJS;
var mfFaceURLEnabled;
var mfLocalImagesEnabled;
var mfLocalPiconImagesEnabled;
var mfMaxSize;
var mfPiconEnabled;
var mfLocalFolder;
var mfContactPhotoEnabled;

// subscript namespaces
var mfMD5m = {};
var mfXFaceJSm = {};
var mfLog = {};

var mfImage = null;
var mfXImage = null;
var mfXImageURL = null;
var mfXFaceURL = null;
var mfFaceURL = null;
var mfExtraGravImage = null;
//var gravHref = document.createElementNS('http://www.w3.org/1999/xhtml', 'a');
var mfExtraPiconImage = null;
var mfContactPhotoImage = null;
var mfX_Cache = new Array();
var mfbase64Grav;

// globabl preference service for reading in values across functions
var prefService;

// Picons - web lookup code partially lifted from https://bugzilla.mozilla.org/show_bug.cgi?id=60881
var piconsSearchURL = "http://kinzler.com/cgi/piconsearch.cgi/";
var piconsDBURL = "https://kinzler.com/picons/db/";
var piconsSearchSuffix = "/users+usenix+misc+domains+unknown/up/single/gif/order";

function mfGetHeaders() {
	// new way to GetFirstSelectedMessage();
	var messageURI = (
		gFolderDisplay.selectedMessageUris &&
		gFolderDisplay.selectedMessageUris[0]
	);

	if (!messageURI) {
		return undefined
	}

	mfLog.info("Loading headers for '" + messageURI + "'.");
	var messageStream = null;
	if (messageURI.substring(0, 7) == "file://") {
		var msgFile = (
			Components.classes["@mozilla.org/network/io-service;1"]
				.getService(Components.interfaces.nsIIOService)
				.getProtocolHandler("file")
				.QueryInterface(Components.interfaces.nsIFileProtocolHandler)
				.getFileFromURLSpec(messageURI)
		);
		messageStream = new (
			Components.Constructor(
				"@mozilla.org/network/file-input-stream;1",
				Components.interfaces.nsIFileInputStream
			)
		);
		messageStream.init(msgFile, 1, 0, false);
	} else {
		try {
			messageStream = new (
				Components.Constructor(
					"@mozilla.org/network/sync-stream-listener;1",
					Components.interfaces.nsIInputStream
				)
			);
			messenger
				.messageServiceFromURI(messageURI)
				.streamMessage(
					messageURI,
					messageStream,
					msgWindow,
					null,
					false,
					null
				);
		} catch (ex) {
			mfLog.warn("Could not stream message '" + messageURI + "'.");
			return null;
		}
	}
	var inputStream = new (
		Components.Constructor(
			"@mozilla.org/scriptableinputstream;1",
			Components.interfaces.nsIScriptableInputStream
		)
	);
	inputStream.init(messageStream);

	var content = "";
	inputStream.available();
	while (inputStream.available()) {
		content = content + inputStream.read(512);
		var p = content.indexOf("\r\n\r\n");
		var p1 = content.indexOf("\r\r");
		var p2 = content.indexOf("\n\n");

		if (p > 0) {
			content = content.substring(0, p);
			break;
		}
		if (p1 > 0) {
			content = content.substring(0, p1);
			break;
		}
		if (p2 > 0) {
			content = content.substring(0, p2);
			break;
		}
		if (content.length > 512 * 64) {
			mfLog.warn("Could not find end-of-headers line in '" + messageURI + "'.");
			content = null;
			alert("ERROR: content.length > 512 * 64");
			break;
		}
	}
	inputStream.close();
	messageStream.close();

	var headers = null;
	if (content) {
		content = content + "\r\n";
		mfLog.fine("Parsing headers.");
		headers = new (
			Components.Constructor(
				"@mozilla.org/messenger/mimeheaders;1",
				Components.interfaces.nsIMimeHeaders
			)
		);
		headers.initialize(content, content.length);
		mfLog.fine("Done. headers=" + headers);
	}
	return headers;
}

function mfDisplayFace(mfFileHandler) {
	var headers = mfGetHeaders();
	if (!headers) {
		return;
	}
	// declare local variables that will hold header vals
	var face = headers.extractHeader(
		"face",
		false
	);
	var xFace = headers.extractHeader(
		"x-face",
		false
	);
	var xImageUrl = headers.extractHeader(
		"x-image-url",
		false
	);
	var xFaceUrl = headers.extractHeader(
		"x-face-url",
		false
	);
	var faceUrl = headers.extractHeader(
		"face-url",
		false
	);
	var extraGravFace = null;

	var sender = "";
	if (currentHeaderData["from"] != null) { // get 'from' header values
		sender = currentHeaderData["from"].headerValue;
	}
	if (
		(sender == null || sender == "") &&
		currentHeaderData["return-path"] != null
	) {
		sender = currentHeaderData["return-path"].headerValue;
	}

	// regex replace
	sender = sender.replace(/^.*\</, "");
	sender = sender.replace(/\>.*$/, "");
	sender = sender.toLowerCase();

	if (!sender.match(/.+\@.+/)) {
		mfLog.warn("Invalid sender address: '" + sender + "'.");
		return;
	}

	// Gravatar centralized email address images
	if (mfGravatarEnabled) {
		mfLog.info("Falling back to Gravatar.");
		var mfCalcMD5 = mfMD5m.calcMD5(sender);
		extraGravFace = mfGravatarURL;
		extraGravFace = extraGravFace.replace("%ID%", mfCalcMD5);
		extraGravFace = extraGravFace.replace("%SIZE%", mfMaxSize);
		mfSetExtraGravImage(extraGravFace, mfCalcMD5, mfFileHandler);
	}
	// array to hold URLs of picons stored on disk
	var extraPiconFace = [];

	// support picons
	if (mfPiconEnabled) {
		mfLog.info("Falling back to Picon.");
		var atSign = sender.indexOf('@');

		// if we have a valid e-mail address..
		if (atSign != -1) {
			var host = sender.substring(atSign + 1)
			var user = sender.substring(0, atSign);

			// do a local search for picons - we don't want to kill kinzler.com!
			if (mfLocalPiconImagesEnabled) {
				// split the host up into pieces (we need this since hosts can be different lengths, i.e. cs.gettysburg.edu vs comcast.net, etc.)
				var host_pieces = host.split('.');
				// loop through the six different picon database folders
				for (var i in mfPiconDatabases) {
					// kill the 'unknown' lookup if we already have a picon..
					if (
						mfPiconDatabases[i] == "unknown" &&
						(
							typeof extraPiconFace !== "undefined" &&
							extraPiconFace.length > 0
						)
					) {
						break;
					}

					// clone the current URL, as we will need to use it for the next val in the array
					var localFile = mfLocalFolder.clone();
					localFile.append("picons"); // they are stored in $PROFILEPATH$/messagefaces/picons/ by default
					localFile.append(mfPiconDatabases[i]); // append one of the six database folders
					
					// special case MISC
					if (mfPiconDatabases[i] == "misc") {
						localFile.append("MISC");
					}

					var l = host_pieces.length; // get number of database folders (probably six, but could theoretically change)
					var clonedLocal; // we will check to see if we have a match at EACH depth, so keep a cloned version w/o the 'unknown/face.gif' portion

					while (l >= 0) { // loop through however many pieces we have of the host
						localFile.append(host_pieces[l]); // add that portion of the host (ex: 'edu' or 'gettysburg' or 'cs')
						clonedLocal = localFile.clone();

						// username for 'users' db folder (non-standard)
						if (mfPiconDatabases[i] == "users") {
							localFile.append(user);
						} else {
							localFile.append("unknown");
						}
						localFile.append("face.gif");

						if (localFile.exists()) {
							mfLog.info("Found local picon image.");
							extraPiconFace.push(mfFileHandler.getURLSpecFromFile(localFile));
						}
						localFile = clonedLocal.clone(); // revert back to old local URL (before above modifications)
						l--;
					}
				}

				// check to see if the array is empty
				if (
					!(
						typeof extraPiconFace !== 'undefined' &&
						extraPiconFace.length > 0
					)
				) {
					var defaultMisc = mfLocalFolder.clone();
					defaultMisc.append("picons");

					// randomly set unknown address to default unknown picon or pjw face
					defaultMisc.append("unknown");
					defaultMisc.append("MISC");
					defaultMisc.append("unknown");
					defaultMisc.append("face.gif");
					extraPiconFace.push(mfFileHandler.getURLSpecFromFile(defaultMisc));
				}

				mfSetExtraPiconImage(extraPiconFace);
			} else { // if we are not using a local search, use a web lookup using piconsearch.pl
				var host_pieces = host.split('.');
				var faceCounter = 0;

				// loop through the six different picon database folders
				for (var i in mfPiconDatabases) {
					var k_url = piconsDBURL + mfPiconDatabases[i] + "/";
					var l = host_pieces.length - 1;
					var clonedLocal;
					if (mfPiconDatabases[i] == "misc") {
						k_url += "MISC/";
					} // special case MISC

					while (l >= 0) { // loop through however many pieces we have of the host
						k_url += host_pieces[l] + "/"; // add that portion of the host (ex: 'edu' or 'gettysburg' or 'cs')
						// http://stackoverflow.com/questions/728360/how-to-correctly-clone-a-javascript-object
						clonedLocal = k_url + "";

						// username for 'users' db folder (non-standard)
						if (mfPiconDatabases[i] == "users") {
							k_url += user + "/";
						} else {
							k_url += "unknown/";
						}
						k_url += "face.gif";

						getMetaPicon(
							k_url,
							function(width, height, src) {
								mfLog.info("Found local picon image.");

								if (!src.includes("db/unknown")) {
									faceCounter++;
									extraPiconFace.push(src);
									mfSetExtraPiconImage(extraPiconFace);
								} else if (
									src.includes("db/unknown") &&
									faceCounter == 0
								) {
									faceCounter++;
									extraPiconFace.push(src);
									mfSetExtraPiconImage(extraPiconFace);
								}

								//return;
							}
						);

						k_url = clonedLocal; // revert back to old local URL (before above modifications)
						l--;
					}
				}
			}
			// msgPaneData.PiconBox.removeAttribute('collapsed');
		}
	} else {
		mfSetExtraPiconImage("");
	}

	// Simple Face PNG image
	if (face != null) {
		mfLog.info("Face found.");
		face = face.replace(/(\s)+/g, "");

		// cap at 966 total bytes. see Face header spec for details
		if (face.length > 966) {
			mfLog.warn("Malformed face header encountered - length is " + face.length + " bytes.");
		} else {
			mfSetImage("data:image/png;base64," + encodeURIComponent(face));
		}
	} else {
		var face = null;

		// local icon directory enabled?
		if (mfLocalImagesEnabled) {
			for (var i in mfFileExtensions) {
				var localFile = mfLocalFolder.clone();
				localFile.append(sender + "." + mfFileExtensions[i]);

				if (localFile.exists()) {
					mfLog.info("Found local image.");
					face = mfFileHandler.getURLSpecFromFile(localFile);
					break;
				}
			}
		}

		if (face != null) {
			mfSetImage(face);
		} else {
			mfSetImage("");
		}
	}

	// older and not so simple X-Face image
	// cached because it's slow. TODO: persistent cache
	if (
		xFace != null &&
		mfXFaceUseJS
	) {
		mfLog.info("X-Face found.");
		xFace = xFace.replace(/ /g, "");
		var koComputedStyle = window.getComputedStyle(mfXImage, null);
		//var ksFaceURL = mfXFaceJSm.FaceURL(xFace, koComputedStyle);

		if (mfX_Cache[xFace] == null) {
			// It'd be nice to do this asyncronously. Wonder how. Me no know.
			//mfX_Cache[xFace] = mfXFaceJSm.FaceURL(xFace);
			mfX_Cache[xFace] = mfXFaceJSm.FaceURL(xFace, koComputedStyle);
		}

		mfSetXImage(mfX_Cache[xFace]);
		// mfSetXImage(ksFaceURL);
	} else if (xFace == null) {
		mfSetXImage("");
	} else {
		mfSetXImage("");
	}

	// Face that resides on a web server somewhere - POSSIBLE SECURITY/PRIVACY RISK!
	if (mfFaceURLEnabled) {
		if (xImageUrl != null) {
			mfLog.info("X-Image-URL found.");
			xImageUrl = xImageUrl.replace(/ /g, "");

			if (xImageUrl.match(/^(http|https|ftp):/)) {
				mfSetXImageURL(xImageUrl);
			} else {
				mfLog.warn("Malformed face URL encountered: '" + xImageUrl + "'.");
			}
		} else if (xImageUrl == null) {
			mfSetXImageURL("");
		} else {
			mfSetXImageURL("");
		}

		if (xFaceUrl != null) {
			mfLog.info("X-Face-URL found.");
			xFaceUrl = xFaceUrl.replace(/ /g, "");

			if (xFaceUrl.match(/^(http|https|ftp):/)) {
				mfSetXFaceURL(xFaceUrl);
			} else {
				mfLog.warn("Malformed face URL encountered: '" + xFaceUrl + "'.");
			}
		} else if (xFaceUrl == null) {
			mfSetXFaceURL("");
		}

		if (faceUrl != null) {
			mfLog.info("Face-URL found.");
			faceUrl = faceUrl.replace(/ /g, "");

			if (faceUrl.match(/^(http|https|ftp):/)) {
				mfSetFaceURL(faceUrl);
			} else {
				mfLog.warn("Malformed face URL encountered: '" + faceUrl + "'.");
			}
		} else if (faceUrl == null) {
			mfSetFaceURL("");
		}
	} else {
		mfSetFaceURL("");
	}

	// Get images for sender stored in the address book
	if (mfContactPhotoEnabled) {
		// grab the card details using builtin func
		var cardDetails = GetCardForEmail(sender);

		if (cardDetails.card != null) {
			var photoURL = cardDetails.card.getProperty("PhotoName", null);
			// alert(photoURL+"");
			var localFile = (
				Components.classes["@mozilla.org/file/directory_service;1"]
					.getService(Components.interfaces.nsIProperties)
					.get("ProfD", Components.interfaces.nsIFile).clone()
			);

			localFile.append("Photos");
			// get the photo name from email address
			localFile.append(photoURL + "");

			if (photoURL != null) {
				mfSetContactPhotoImage(mfFileHandler.getURLSpecFromFile(localFile));
			} else {
				mfSetContactPhotoImage("");
			}
		} else {
			mfSetContactPhotoImage("");
		}
	} else {
		mfSetContactPhotoImage("");
	}

	mfLog.fine("exiting mfDisplayFace().");
}

// set Face image
function mfSetImage(url) {
	mfLog.fine("Setting face: '" + url + "'.");

	if (url == "") {
		mfImage.style.display = "none";
	} else {
		mfImage.style.display = "block";
	}

	mfImage.setAttribute("src", url);
}

// set X-Image-URL image
function mfSetXImageURL(url) {
	mfLog.fine("Setting X-Image-URL: '" + url + "'.");

	if (url == "") {
		mfXImageURL.style.display = "none";
	} else {
		mfXImageURL.style.display = "block";
	}

	mfXImageURL.setAttribute("src", url);
}

// set X-Face-URL image
function mfSetXFaceURL(url) {
	mfLog.fine("Setting X-Face-URL: '" + url + "'.");

	if (url == "") {
		mfXFaceURL.style.display = "none";
	} else {
		mfXFaceURL.style.display = "block";
	}

	mfXFaceURL.setAttribute("src", url);
}

// set Face-URL image
function mfSetFaceURL(url) {
	mfLog.fine("Setting Face-URL: '" + url + "'.");

	if (url == "") {
		mfFaceURL.style.display = "none";
	} else {
		mfFaceURL.style.display = "block";
	}

	mfFaceURL.setAttribute("src", url);
}

// set X-Face image
function mfSetXImage(url) {
	mfLog.fine("Setting X-Face: '" + url + "'.");

	if (url == "") {
		mfXImage.style.display = "none";
	} else {
		mfXImage.style.display = "block";
	}

	mfXImage.setAttribute("src", url);
}

function mfSetContactPhotoImage(url) {
	mfLog.fine("Setting Contact Photo: '" + url + "'.");

	if (url == "") {
		mfContactPhotoImage.style.display = "none";
	} else {
		mfContactPhotoImage.style.display = "block";
	}

	mfContactPhotoImage.setAttribute("src", url);
}

// check to see if gravatar image exists
// http://stackoverflow.com/questions/11442712/get-width-height-of-remote-image-from-url
function getMeta(url, callback) {
	var img = new Image();
	img.src = url;
	img.onload = function() {
		mfbase64Grav = getBase64Image(img);
		callback(
			this.width,
			this.height,
		);
	}
}

function getMetaPicon(url, callback) {
	var img = new Image();
	img.onload = function() {
		callback(
			this.width,
			this.height,
			this.src
		);
	}
	img.src = url;
}

// http://stackoverflow.com/questions/934012/get-image-data-in-javascript
function getBase64Image(img) {
	// create an empty canvas element
	var canvas = content.document.createElementNS(
		"http://www.w3.org/1999/xhtml",
		"canvas"
	);
	canvas.width = img.width;
	canvas.height = img.height;

	// Copy the image contents to the canvas
	var ctx = canvas.getContext("2d");
	ctx.drawImage(img, 0, 0);

	// Get the data-URL formatted image
	// Firefox supports PNG and JPEG. You could check img.src to
	// guess the original format, but be aware the using "image/jpg"
	// will re-encode the image.
	var dataURL = canvas.toDataURL("image/png");

	return dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
}

// set Gravatar image
function mfSetExtraGravImage(url, mfCalcMD5, mfFileHandler) {
	mfLog.fine("Setting grav: '" + url + "'.");

	var found = false;
	getMeta(url, function(width, height) {
		var localFile = mfLocalFolder.clone();
		localFile.append(mfCalcMD5 + ".png");

		if (
			!localFile.exists() &&
			mfGravatarEnableCache
		) {
			Components.utils.import("resource://gre/modules/osfile.jsm");

			var file = (
				OS.Path
				.join(
					OS.Constants.Path.profileDir,
					"messagefaces", mfCalcMD5 + ".png"
				)
			);
			var str = mfbase64Grav.replace(/^.*?;base64,/, "");
			// decode to a byte string
			str = atob(str);
			// decode to an Uint8Array, because OS.File.writeAtomic expects an ArrayBuffer(View).
			var data = new Uint8Array(str.length);
			for (var i = 0, e = str.length; i < e; ++i) {
				data[i] = str.charCodeAt(i);
			}

			// To support Firefox 24 and earlier, you'll need to provide a tmpPath. See MDN.
			// There is in my opinion no need to support these, as they are end-of-life and
			// contain known security issues. Let's not encourage users. ;)
			var promised = OS.File.writeAtomic(file, data);
			promised.then(
				// Success!
				function() {},
				// Failed. Error information in ex
				function(ex) {}
			);
		} else if (localFile.exists()) {
			//gravHref.href = mfFileHandler.getURLSpecFromFile(localFile);
			mfExtraGravImage.style.display = "block";
			mfExtraGravImage.setAttribute("src", mfFileHandler.getURLSpecFromFile(localFile));
			return;
		}

		//gravHref.href = url;
		mfExtraGravImage.style.display = "block";
		mfExtraGravImage.setAttribute("src", url);

		return;
	});

	mfExtraGravImage.style.display = "none"
}

// set Picon image
function mfSetExtraPiconImage(extraPiconFace) {
	mfLog.fine("Setting picon: '" + extraPiconFace[i] + "'.");

	for (var i = extraPiconFace.length - 1; i >= 0; i--) {
		// get all of the existing piconBoxes for however many picons we found
		var item = document.getElementById("piconBox" + i);

		// if it does not already exist, create it
		if (item == null) {
			var piconBox = document.createElement("vbox");
			piconBox.setAttribute("id", "piconBox" + i);

			var spacer = document.createElement("spacer");
			spacer.setAttribute("flex", "1");
			piconBox.appendChild(spacer);

			mfExtraPiconImage = document.createElement("image");
			mfExtraPiconImage.setAttribute("style", "margin: 5px");
			mfExtraPiconImage.setAttribute("id", "fromBuddyIconPicon" + i);
			mfExtraPiconImage.setAttribute("src", extraPiconFace[i]);
			piconBox.appendChild(mfExtraPiconImage);

			spacer = document.createElement("spacer");
			spacer.setAttribute("flex", "1");
			piconBox.appendChild(spacer);

			if (
				(i > 0) &&
				(document.getElementById("piconBox" + (i - 1)) != null)
			) {
				// if we are re-adding box, add it before the earlier ones (ordering)
				document.getElementById("expandedHeaderView").insertBefore(piconBox, document.getElementById("piconBox" + (i - 1)));
			} else {
				// normal add
				document.getElementById("expandedHeaderView").appendChild(piconBox);
			}
		// if it does already exists, use it
		} else {
			document.getElementById("fromBuddyIconPicon" + i).setAttribute("src", extraPiconFace[i]);
		}
	}

	// remove extra piconBoxes that could have previously been created
	var count = extraPiconFace.length;
	var rmBox = document.getElementById("piconBox" + count);

	while (rmBox != null) {
		// remove all children from the vbox
		while (rmBox.firstChild) {
			rmBox.removeChild(rmBox.firstChild);
		}

		rmBox.parentNode.removeChild(rmBox);
		count++;
		rmBox = document.getElementById("piconBox" + count);
	}
	//document.getElementById("expandedHeaderView").appendChild(masterBox);
}

function mfLoadPrefs() {
	mfGravatarEnabled = mfGetPref(
		"gravatar.enabled",
		"Bool"
	);
	mfGravatarEnableCache = mfGetPref(
		"gravatar.enableCache",
		"Bool"
	);
	mfGravatarURL = mfGetPref(
		"gravatar.url",
		"Char"
	);
	mfXFaceUseJS = mfGetPref(
		"xface.useJS",
		"Bool"
	);
	mfFaceURLEnabled = mfGetPref(
		"faceURL.enabled",
		"Bool"
	);
	mfLocalImagesEnabled = mfGetPref(
		"local.enabled",
		"Bool"
	);
	mfLocalPiconImagesEnabled = mfGetPref(
		"localPicon.enabled",
		"Bool"
	);
	mfPiconEnabled = mfGetPref(
		"picon.enabled",
		"Bool"
	);
	mfContactPhotoEnabled = mfGetPref(
		"contactPhoto.enabled",
		"Bool"
	);
	mfMaxSize = mfGetPref(
		"maxsize",
		"Int"
	);
	mfLog.init(
		"MessageFaces",
		mfGetPref("loglevel", "Int")
	);

	try {
		mfLocalFolder = (
			mfPref
				.getComplexValue(
					"local.folder",
					Components.interfaces.nsILocalFile
				)
		);
	} catch (e) {
		mfLocalFolder = (
			Components.classes["@mozilla.org/file/directory_service;1"]
				.getService(Components.interfaces.nsIProperties)
				.get(
					"ProfD",
					Components.interfaces.nsIFile
				)
		);
		var p = mfLocalFolder.permissions;
		mfLocalFolder.append("messagefaces");

		if (!mfLocalFolder.exists()) {
			mfLocalFolder.create(
				Components.interfaces.nsIFile.DIRECTORY_TYPE,
				p
			);
		}
	}

	var gravBox = document.createElement("vbox");
	var spacer = document.createElement("spacer");
	spacer.setAttribute("flex", "1");
	gravBox.appendChild(spacer);
	mfExtraGravImage = document.createElement("image");
	mfExtraGravImage.setAttribute("style", "margin: 5px");
	mfExtraGravImage.setAttribute("id", "fromBuddyIconGrav");
	//gravHref.appendChild(mfExtraGravImage);
	gravBox.appendChild(mfExtraGravImage);
	spacer = document.createElement("spacer");
	spacer.setAttribute("flex", "1");
	gravBox.appendChild(spacer);
	document.getElementById("expandedHeaderView").appendChild(gravBox);

	// Get face image element
	if (mfXImage == null) {
		// Thunderbird 2 no longer ships a "fromBuddyIcon" image, so we create our own
		var vbox = document.createElement("vbox");
		var spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		mfXImage = document.createElement("image");
		mfXImage.setAttribute("style", "margin: 5px");
		mfXImage.setAttribute("id", "fromBuddyIconXFace");
		vbox.appendChild(mfXImage);
		spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		document.getElementById("expandedHeaderView").appendChild(vbox);
	}

	if (mfXImageURL == null) {
		// Thunderbird 2 no longer ships a "fromBuddyIcon" image, so we create our own
		var vbox = document.createElement("vbox");
		var spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		mfXImageURL = document.createElement("image");
		mfXImageURL.setAttribute("style", "margin: 5px");
		mfXImageURL.setAttribute("id", "fromBuddyIconXImageURL");
		vbox.appendChild(mfXImageURL);
		spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		document.getElementById("expandedHeaderView").appendChild(vbox);
	}

	if (mfXFaceURL == null) {
		// Thunderbird 2 no longer ships a "fromBuddyIcon" image, so we create our own
		var vbox = document.createElement("vbox");
		var spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		mfXFaceURL = document.createElement("image");
		mfXFaceURL.setAttribute("style", "margin: 5px");
		mfXFaceURL.setAttribute("id", "fromBuddyIconXFaceURL");
		vbox.appendChild(mfXFaceURL);
		spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		document.getElementById("expandedHeaderView").appendChild(vbox);
	}

	if (mfFaceURL == null) {
		// Thunderbird 2 no longer ships a "fromBuddyIcon" image, so we create our own
		var vbox = document.createElement("vbox");
		var spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		mfFaceURL = document.createElement("image");
		mfFaceURL.setAttribute("style", "margin: 5px");
		mfFaceURL.setAttribute("id", "fromBuddyIconFaceURL");
		vbox.appendChild(mfFaceURL);
		spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		document.getElementById("expandedHeaderView").appendChild(vbox);
	}

	if (mfContactPhotoImage == null) {
		var vbox = document.createElement("vbox");
		var spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		mfContactPhotoImage = document.createElement("image");
		mfContactPhotoImage.setAttribute("style", "margin: 5px");
		mfContactPhotoImage.setAttribute("id", "fromBuddyIconContactPhoto");
		vbox.appendChild(mfContactPhotoImage);
		spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		document.getElementById("expandedHeaderView").appendChild(vbox);
	}

	mfImage = document.getElementById("fromBuddyIcon");
	if (mfImage == null) {
		// Thunderbird 2 no longer ships a "fromBuddyIcon" image, so we create our own
		var vbox = document.createElement("vbox");
		var spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		mfImage = document.createElement("image");
		mfImage.setAttribute("style", "margin: 5px");
		mfImage.setAttribute("id", "fromBuddyIconFace");
		vbox.appendChild(mfImage);
		spacer = document.createElement("spacer");
		spacer.setAttribute("flex", "1");
		vbox.appendChild(spacer);
		document.getElementById("expandedHeaderView").appendChild(vbox);
	} else {
		mfImage.style.padding = "0";
	}

	//window.open("chrome://messagefaces/content/vismon.xul", "Vismon", "chrome");
}

var mfPrefObserver = {
	// nsIPrefBranchInternal = pre-Gecko 1.8
	PBI: (
		"nsIPrefBranchInternal" in Components.interfaces
			? Components.interfaces.nsIPrefBranchInternal
			: Components.interfaces.nsIPrefBranch2
	),

	register: function() {
		prefService = (
			Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefService)
		);

		mfPref
			.QueryInterface(this.PBI)
			.addObserver("", this, false);
	},

	unregister: function() {
		mfPref
			.QueryInterface(this.PBI)
			.removeObserver("", this);
	},

	observe: function(aSubject, aTopic, aData) {
		if (aTopic == "nsPref:changed") {
			mfLoadPrefs();
		}
	}
}

function mfGetPref(name, type) {
	return mfGetPrefImpl(
		name,
		type,
		null
	);
}

function mfGetXPref(name, type, defaultValue) {
	return mfGetPrefImpl(
		name,
		type,
		defaultValue
	);
}

function mfGetPrefImpl(name, type, defaultValue, setIt) {
	if (
		(
			type != "Bool" &&
			type != "Char" &&
			type != "Int"
		) ||
		!name
	) {
		return null;
	}
	var value;
	try {
		// switch out gPrefBranch for mfPref...
		value = eval("mfPref.get" + type + "Pref(\"" + name + "\");");
	} catch (e) {
		value = defaultValue;
	}
	return value;
}

// Work around (or at least detect) locale-related bugs in TB
function mfCheckLocale() {
	const chromeRegistry = (
		Components.classes["@mozilla.org/chrome/chrome-registry;1"]
			.getService(Components.interfaces.nsIXULChromeRegistry)
	);
	if (!("selectLocaleForPackage" in chromeRegistry)) {
		var myLocale = chromeRegistry.getSelectedLocale("messagefaces");
		var chromeLocale = chromeRegistry.getSelectedLocale("global");
		var prefLocale = mfGetXPref("general.useragent.locale", "Char", "");

		const bundleService = (
			Components.classes["@mozilla.org/intl/stringbundle;1"]
				.getService()
				.QueryInterface(Components.interfaces.nsIStringBundleService)
		);

		var properties = bundleService.createBundle("chrome://messagefaces/content/mfbuild.properties");
		var supportedLocales = properties.GetStringFromName("messagefaces.supportedLocales");
		var appLocaleSupported = ("," + supportedLocales + ",").indexOf(("," + chromeLocale + ",")) > -1;
		var mfVersion = properties.GetStringFromName("messagefaces.release");
		var warningShown = mfGetPref("localeWarningShown", "Char");

		const url = (
			"http://tecwizards.de/mozilla/messagefaces/localeproblems.html" +
			"?app=" +
			chromeLocale +
			"&ver=" +
			mfVersion
		);
		const inf = "\n\nPlease visit the following web site for more information.";
		const warningFlag = "v" + mfVersion + ":" + chromeLocale + ":p";

		if (
			appLocaleSupported &&
			myLocale != chromeLocale
		) {
			// Some TB builds don't include the global locale pref
			if (chromeLocale != prefLocale) {
				mfPref.setCharPref(
					"general.useragent.locale",
					chromeLocale
				); // change gPrefBranch to mfPref
				// Our pref window will pick up the change when it's opened, so we
				// don't need to tell the user to restart Thunderbird.
			} else if (warningShown != warningFlag + "1") {
				mfPref.setCharPref("localeWarningShown", warningFlag + "1");
				prompt(
					"MessageFaces supports your language ('" +
					chromeLocale +
					"'), but Thunderbird\nchose another language for the " +
					"extension. " + inf, url + "&problem=1"
				);
			}
		} else if (
			!appLocaleSupported &&
			myLocale != "en-US" &&
			warningShown != warningFlag + "2"
		) {
			mfPref.setCharPref(
				"localeWarningShown",
				warningFlag + "2"
			);
			prompt(
				"Although Thunderbird is supposed to select english texts for\n" +
				"MessageFaces, it chose another language for the extension. " +
				inf, url + "&problem=2"
			);
		}
	}
}

// chrome://messenger/content/messenger.xul
// <window id="messengerWindow" />
addEventListener(
	"DOMContentLoaded",
	function DOMContentLoaded() {
		// only run the window initialization logic once
		removeEventListener("DOMContentLoaded", DOMContentLoaded, true);

		var mfFileHandler = (
			Components.classes["@mozilla.org/network/io-service;1"]
				.getService(Components.interfaces.nsIIOService)
				.getProtocolHandler("file")
				.QueryInterface(Components.interfaces.nsIFileProtocolHandler)
		);
		var jsLoader = (
			Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
				.getService(Components.interfaces.mozIJSSubScriptLoader)
		);
		var md5Type = (
			"nsICryptoHash" in Components.interfaces
				? "call"
				: "impl"
		);
		jsLoader.loadSubScript(
			"chrome://messagefaces/content/lib/md5-" + md5Type + ".js",
			mfMD5m
		);
		jsLoader.loadSubScript(
			"chrome://messagefaces/content/lib/xface.js",
			mfXFaceJSm
		);
		jsLoader.loadSubScript(
			"chrome://messagefaces/content/lib/logging.js",
			mfLog
		);
		prefService = (
			Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefService)
		);
		mfPref = prefService.getBranch("extensions.messagefaces.");
		mfLoadPrefs();
		mfPrefObserver.register();
		mfCheckLocale();

		// chrome://messenger/content/messenger.xul
		// <XUL:notificationbox id="messagepanebox" />
		window.document.getElementById("messagepanebox").addEventListener(
			"DOMContentLoaded",
			function() {
				mfDisplayFace(mfFileHandler);
			},
			true
		)
	},
	true
);
