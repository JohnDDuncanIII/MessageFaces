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
* The Initial Developer of the Original Code is John Duncan.
* Portions created by the Initial Developer are Copyright (C) 2016
* the Initial Developer. All Rights Reserved.
*
* Contributor(s) (alphabetical order):
*  John Duncan <duncjo01@gettysburg.edu>
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
var mfPref;
var _prefService;
var mfGravatarEnabled;
//var mfGravatarEnableCache;
var mfPiconEnabled;
var mfLocalPiconImagesEnabled;
var mfXFaceUseJS;
var mfMaxSize;
var mfLocalFolder;
var mfGravatarURL;
var mfMD5 = {};
var mfXFaceJS = {};
var mfLocalImagesEnabled;
var mfContactPhotoEnabled;
var mfFaceURLEnabled;
var mfColumnEnabled;
var mfX_Cache = new Array();
// file extensions for local FACE lookups
var mfFileExtensions = new Array("jpg", "png", "gif");
// picon database folders
var mfPiconDatabases = new Array("domains", "users", "misc", "usenix", "unknown");
var mfIOService = (
	Components.classes["@mozilla.org/network/io-service;1"]
		.getService(Components.interfaces.nsIIOService)
);
var mfFileHandler = (
	mfIOService
		.getProtocolHandler("file")
		.QueryInterface(Components.interfaces.nsIFileProtocolHandler)
);

var columnHandler = {
	isEditable: function(aRow, aCol) {
		return false;
	},
	getCellProperties: function(row, col, props) {
		return "faceImage";
	},
	getImageSrc: function(row, col) {
		var hdr = gDBView.getMsgHdrAt(row);
		var sender = hdr.getStringProperty("sender");
		sender = sender.replace(
			/^.*\</,
			""
		);
		sender = sender.replace(
			/\>.*$/,
			""
		);
		sender = sender.toLowerCase();

		var faceHdr = hdr.getStringProperty("face");

		// Simple Face PNG image
		if (faceHdr != "") {
			faceHdr = faceHdr.replace(
				/(\s)+/g,
				""
			);
			return "data:image/png;base64," + encodeURIComponent(faceHdr);
		} else {
			faceHdr = null;

			// Local icon directory enabled?
			if (mfLocalImagesEnabled) {
				for (var i in mfFileExtensions) {
					var localFile = mfLocalFolder.clone();
					localFile.append(sender + "." + mfFileExtensions[i]);
					if (localFile.exists()) {
						return mfFileHandler.getURLSpecFromFile(localFile);
					}
				}
			}
		}

		var xfaceHdr = hdr.getStringProperty("x-face");
		if (
			xfaceHdr != "" &&
			mfXFaceUseJS
		) {
			xfaceHdr = xfaceHdr.replace(
				/ /g,
				""
			);
			var koComputedStyle = window.getComputedStyle(
				mfXImage,
				null
			);
			//var ksFaceURL = mfXFaceJS.FaceURL(xfaceHdr, koComputedStyle);

			if (mfX_Cache[xfaceHdr] == null) {
				// It'd be nice to do this asyncronously. Wonder how. Me no know.
				//mfX_Cache[xfaceHdr] = mfXFaceJS.FaceURL(xfaceHdr);
				mfX_Cache[xfaceHdr] = mfXFaceJS.FaceURL(
					xfaceHdr,
					koComputedStyle
				);
			}
			return mfX_Cache[xfaceHdr];
			// return ksFaceURL;
		}

		// get image from gravatar service (or locally, if cached)
		if (mfGravatarEnabled) {
			var mfCalcMD5 = mfMD5.calcMD5(sender);
			var localFile = mfLocalFolder.clone();
			localFile.append(mfCalcMD5 + ".png");

			if (localFile.exists()) {
				return mfFileHandler.getURLSpecFromFile(localFile);
			}
		}

		// Get images for sender stored in the address book
		if (mfContactPhotoEnabled) {
			// grab the card details using builtin func
			var cardDetails = GetCardForEmail(sender);
			if (cardDetails.card != null) {
				var photoURL = cardDetails.card.getProperty(
					"PhotoName",
					null
				);
				var localFile = (
					Components.classes["@mozilla.org/file/directory_service;1"]
						.getService(Components.interfaces.nsIProperties)
						.get(
							"ProfD",
							Components.interfaces.nsIFile
						).clone()
				);
				localFile.append("Photos");
				// get the photo name from email address
				localFile.append(photoURL + "");
				if (photoURL != null) {
					return mfFileHandler.getURLSpecFromFile(localFile);
				}
			}
		}

		var xImageUrl = hdr.getStringProperty("x-image-url");
		var xFaceUrl = hdr.getStringProperty("x-face-url");
		var faceUrl = hdr.getStringProperty("face-url");
		// face that resides on a web server somewhere
		// POSSIBLE SECURITY/PRIVACY RISK!
		if (mfFaceURLEnabled) {
			if (xImageUrl != "") {
				xImageUrl = xImageUrl.replace(
					/ /g,
					""
				);

				if (xImageUrl.match(/^(http|https|ftp):/)) {
					return xImageUrl;
				} else {
					dump("Malformed face URL encountered: '" + xImageUrl + "'.");
				}
			}

			if (xFaceUrl != "") {
				xFaceUrl = xFaceUrl.replace(
					/ /g,
					""
				);

				if (xFaceUrl.match(/^(http|https|ftp):/)) {
					return xFaceUrl;
				} else {
				}
			}

			if (faceUrl != "") {
				faceUrl = faceUrl.replace(
					/ /g,
					""
				);

				if (faceUrl.match(/^(http|https|ftp):/)) {
					return faceUrl;
				} else {
					// dump("Malformed face URL encountered: '" + faceUrl + "'.");
				}
			}
		}

		return computePicon(sender);
	},

	getCellText: function(row, col) {
		var key = gDBView.getKeyAt(row);
		if (!key) {
			return "?";
		}

		var hdr = gDBView.db.GetMsgHdrForKey(key);
		if (!hdr) {
			return "?";
		}

		/*
		  return hdr.getProperty("face") || hdr.getProperty("x-face") ||
		  hdr.getProperty("face-url") || hdr.getProperty("x-image-url") ||
		  hdr.getProperty("x-face-url") || hdr.getProperty("sender") || "?";
		*/

		var sender = hdr.getStringProperty("sender");
		if (sender.length > 0) {
			sender = sender.replace(
				/^.*\</,
				""
			);
			sender = sender.replace(
				/\>.*$/,
				""
			);
			sender = sender.toLowerCase();
		}

		if (hdr.getProperty("face").length > 0) {
			return hdr.getProperty("face");
		}

		if (hdr.getProperty("x-face").length > 0) {
			return hdr.getProperty("x-face");
		}

		if (mfGravatarEnabled) {
			var mfCalcMD5 = mfMD5.calcMD5(sender);
			var localFile = mfLocalFolder.clone();
			localFile.append(mfCalcMD5 + ".png");

			if (localFile.exists()) {
				return "" + mfFileHandler.getURLSpecFromFile(localFile);
			}
		}

		if (hdr.getProperty("sender").length > 0) {
			var atSign = sender.indexOf('@');
			var user = sender.substring(
				0,
				atSign
			);
			var host = sender.substring(atSign + 1)
			var host_pieces = host.split('.');
			var toReturn = "";

			for (var i = host_pieces.length - 1; i >= 0; i--) {
				toReturn += host_pieces[i];
				if (i != 0) {
					toReturn += ".";
				}
			}
			toReturn += "@" + user;

			return (toReturn);
		}

		return "?";
	},
	cycleCell: function(aRow, aCol) {},
	getSortStringForRow: function(hdr) {
		if (!hdr) {
			return "?";
		}
		var sender = hdr.getStringProperty("sender");
		if (sender.length > 0) {
			sender = sender.replace(
				/^.*\</,
				""
			);
			sender = sender.replace(
				/\>.*$/,
				""
			);
			sender = sender.toLowerCase();
		}

		/*
	  		return ("0" + hdr.getProperty("face")) || ("1" + hdr.getProperty("x-face")) ||
	  		("2" + hdr.getProperty("face-url")) || ("3" + hdr.getProperty("x-image-url")) ||
	  		("4" + hdr.getProperty("x-face-url")) || ("5" + hdr.getProperty("sender")) || ("?");
		*/

		if (hdr.getProperty("face").length > 0) {
			return "0" + hdr.getProperty("face");
		}

		if (hdr.getProperty("x-face").length > 0) {
			return "1" + hdr.getProperty("x-face");
		}

		if (mfGravatarEnabled) {
			var mfCalcMD5 = mfMD5.calcMD5(sender);
			var localFile = mfLocalFolder.clone();
			localFile.append(mfCalcMD5 + ".png");

			if (localFile.exists()) {
				return "2" + mfFileHandler.getURLSpecFromFile(localFile).toString();
			}
		}

		if (hdr.getProperty("sender").length > 0) {
			var atSign = sender.indexOf('@');
			var user = sender.substring(
				0,
				atSign
			);
			var host = sender.substring(atSign + 1)
			var host_pieces = host.split('.');
			var toReturn = "";

			for (var i = host_pieces.length - 1; i >= 0; i--) {
				toReturn += host_pieces[i];

				if (i != 0) {
					toReturn += ".";
				}
			}

			toReturn += "@" + user;
			return ("5" + toReturn);
		}

		return "?";
		// return hdr.mime2DecodedAuthor.charAt(1).toUpperCase() || "?";
	},
	getSortLongForRow: function(hdr) {
		return 0;
	},
	isString: function() {
		return true;
	},
	getRowProperties: function(row, props) {
		return "faceImage";
	}
}

function get(url) {
	return new Promise(function(resolve, reject) {
		var img = new Image();
		img.onload = function() {
			resolve("Stuff worked!");
		};
		img.onerror = function() {
			reject(Error("It broke"));
		};
		img.src = url;
	});
}

function computePicon(sender) {
	var toReturn = null;

	if (mfPiconEnabled) {
		var atSign = sender.indexOf('@');
		// if we have a valid e-mail address..
		if (atSign != -1) {
			var host = sender.substring(atSign + 1)
			var user = sender.substring(
				0,
				atSign
			);

			// do a local search for picons
			if (mfLocalPiconImagesEnabled) {
				// split the host up into pieces
				// (we need this since hosts can be different lengths,
				// i.e. cs.gettysburg.edu vs comcast.net, etc.)
				var host_pieces = host.split('.');

				// loop through the six different picon database folders
				for (var i in mfPiconDatabases) {
					// kill the 'unknown' lookup if we already have a picon..
					if (
						mfPiconDatabases[i] == "unknown" &&
						toReturn != null
					) {
						break;
					}

					// clone the current URL, as we will need to use it for the next val in the array
					var localFile = mfLocalFolder.clone();
					// they are stored in $PROFILEPATH$/messagefaces/picons/ by default
					localFile.append("picons");
					// append one of the six database folders
					localFile.append(mfPiconDatabases[i]);
					// special case MISC
					if (mfPiconDatabases[i] == "misc") {
						localFile.append("MISC");
					}

					// get number of database folders (probably six, but could theoretically change)
					var l = host_pieces.length;
					// we will check to see if we have a match at EACH depth,
					// so keep a cloned version w/o the 'unknown/face.gif' portion
					var clonedLocal;

					// loop through however many pieces we have of the host
					while (l >= 0) {
						// add that portion of the host (ex: 'edu' or 'gettysburg' or 'cs')
						localFile.append(host_pieces[l]);
						clonedLocal = localFile.clone();

						// username for 'users' db folder (non-standard)
						if (mfPiconDatabases[i] == "users") {
							localFile.append(user);
						} else {
							localFile.append("unknown");
						}

						localFile.append("face.gif");

						if (localFile.exists()) {
							toReturn = mfFileHandler.getURLSpecFromFile(localFile);
						}

						// revert back to old local URL (before above modifications)
						localFile = clonedLocal.clone();
						l--;
					}
				}

				// check to see if the val is null
				if (toReturn == null) {
					var defaultMisc = mfLocalFolder.clone();
					defaultMisc.append("picons");
					defaultMisc.append("misc");
					defaultMisc.append("MISC");
					defaultMisc.append("noface");
					defaultMisc.append("face.gif");

					toReturn = mfFileHandler.getURLSpecFromFile(defaultMisc);
				}
			}

			// return toReturn;
			if (toReturn != null) {
				return toReturn;
			}
		}
	}
}

function addCustomColumnHandler() {
	gDBView.addColumnHandler(
		"colFaceHeader",
		columnHandler
	);
}

var CreateDbObserver = {
	observe: function(aMsgFolder, aTopic, aData) {
		addCustomColumnHandler();
	}
}

function main() {
	this._prefService = (
		Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefBranch)
	);
	var jsLoaderMessenger = (
		Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
			.getService(Components.interfaces.mozIJSSubScriptLoader)
	);

	var md5Type = (
		"nsICryptoHash" in Components.interfaces
			? "call"
			: "impl"
	);
	jsLoaderMessenger.loadSubScript(
		"chrome://messagefaces/content/lib/md5-" + md5Type + ".js",
		mfMD5
	);
	jsLoaderMessenger.loadSubScript(
		"chrome://messagefaces/content/lib/xface.js",
		mfXFaceJS
	);

	mfGravatarEnabled = this._prefService.getBoolPref(
		"extensions.messagefaces.gravatar.enabled"
	);
	// mfGravatarEnableCache = this._prefService.getBoolPref(
	// 	"extensions.messagefaces.gravatar.enableCache"
	// );
	mfXFaceUseJS = this._prefService.getBoolPref(
		"extensions.messagefaces.xface.useJS"
	);
	mfMaxSize = this._prefService.getIntPref(
		"extensions.messagefaces.maxsize"
	);
	mfPiconEnabled = this._prefService.getBoolPref(
		"extensions.messagefaces.picon.enabled"
	);
	mfGravatarURL = this._prefService.getCharPref(
		"extensions.messagefaces.gravatar.url"
	);
	mfLocalPiconImagesEnabled = this._prefService.getBoolPref(
		"extensions.messagefaces.localPicon.enabled"
	);
	mfLocalImagesEnabled = this._prefService.getBoolPref(
		"extensions.messagefaces.local.enabled"
	);
	mfContactPhotoEnabled = this._prefService.getBoolPref(
		"extensions.messagefaces.contactPhoto.enabled"
	);
	mfFaceURLEnabled = this._prefService.getBoolPref(
		"extensions.messagefaces.faceURL.enabled"
	);
	mfColumnEnabled = this._prefService.getBoolPref(
		"extensions.messagefaces.column.enabled"
	);

	//if (mfColumnEnabled) {
	var prefService = (
		Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefService)
	);
	mfPref = prefService.getBranch("extensions.messagefaces.");

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

	var ObserverService = (
		Components.classes["@mozilla.org/observer-service;1"]
			.getService(Components.interfaces.nsIObserverService)
	);

	if (window.hasOwnProperty("gDBView")) {
		ObserverService.addObserver(
			CreateDbObserver,
			"MsgCreateDBView",
			false
		);

		// https://developer.mozilla.org/en-US/docs/Mozilla/Thunderbird/Thunderbird_extensions/HowTos/Common_Thunderbird_Extension_Techniques/Detect_Opening_Folder
		// https://developer.mozilla.org/en-US/docs/Mozilla/Thunderbird/Thunderbird_extensions/customDBHeaders_Preference
		// window
		// 	.document
		// 	.getElementById("folderTree")
		// 	.addEventListener(
		// 		"select",
		// 		addCustomColumnHandler,
		// 		false
		// 	);
	}
}

main();
