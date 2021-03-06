"use strict";

/*var w = Components.classes["@mozilla.org/appshell/window-mediator;1"]
	.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("mail:3pane");
w.addEventListener("close", function(event) {
	window.close();
}, false);*/

// get uri to current profile directory
var mfLocalFolder;
try {
	mfLocalFolder = mfPref.getComplexValue(
		"local.folder",
		Components.interfaces.nsILocalFile
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

// globals for picon searches (mainly used to check if a file exists in the picon database)
var mfIOService = (
	Components.classes["@mozilla.org/network/io-service;1"]
		.getService(Components.interfaces.nsIIOService)
);
var mfFileHandler = (
	mfIOService
		.getProtocolHandler("file")
		.QueryInterface(Components.interfaces.nsIFileProtocolHandler)
);

// global to get account-related information
var acctMgr = (
	Components.classes["@mozilla.org/messenger/account-manager;1"]
		.getService(Components.interfaces.nsIMsgAccountManager)
);
var accounts = acctMgr.accounts;

// update message counts when new messages are received
Components.utils.import("resource:///modules/gloda/mimemsg.js");
var newMailListener = {
	msgAdded: function(aMsgHdr) {
		var folder = aMsgHdr.folder;

		if (folder.prettiestName == "Inbox") {
			mailCheck(folder);

			if (window.name == "Mailcheck") {
				window.resizeTo(
					container.boxObject.width,
					container.boxObject.height
				);
			}
		}
	}
};
var notificationService = (
	Components.classes["@mozilla.org/messenger/msgnotificationservice;1"]
		.getService(Components.interfaces.nsIMsgFolderNotificationService)
);
notificationService.addListener(
	newMailListener,
	notificationService.msgAdded
);

// update message counts when a message is read inside of a folder
Components.utils.import(
	"resource:///modules/mailServices.js",
	this
);
var mailListener = {
	OnItemIntPropertyChanged: function(aItem, aProperty, aOldValue, aNewValue) {
		if (
			//aProperty.toString() == "FolderSize" ||
			//aProperty.toString() == "TotalMessages" ||
			aProperty.toString() == "TotalUnreadMessages"
		) {
			if (aItem.prettyName == "Inbox") {
				mailCheck(aItem);

				if (window.name == "Mailcheck") {
					window.resizeTo(container.boxObject.width, container.boxObject.height);
				}
			}
		}
	},
};
var notifyFlags = Components.interfaces.nsIFolderListener.intPropertyChanged;
MailServices.mailSession.AddFolderListener(
	mailListener,
	notifyFlags
);

// used for iterating over msgHdr's in a given Inbox
Components.utils.import("resource:///modules/iteratorUtils.jsm");

// remove all listeners when we kill the window
window.addEventListener(
	"close",
	function(event) {
		MailServices.mailSession.RemoveFolderListener(mailListener);
		notificationService.removeListener(newMailListener);
	},
	false
);

// the container (in our mailcheck XUL window) that will be populated with account folder picons
var container = document.getElementById("container");

function mail() {
	if (accounts.queryElementAt) {
		// Gecko 17+
		for (var i = 0; i < accounts.length; i++) {
			var account = accounts.queryElementAt(
				i,
				Components.interfaces.nsIMsgAccount
			);
			// nsIMsgFolder
			var rootFolder = account.incomingServer.rootFolder;

			if (
				rootFolder.hasSubFolders &&
				!rootFolder.URI.includes("news://")
			) {
				var folderContainer = document.getElementById(rootFolder.abbreviatedName);
				if (!folderContainer) {
					folderContainer = document.createElement("hbox");
					folderContainer.setAttribute(
						"id",
						rootFolder.abbreviatedName
					);
					container.appendChild(folderContainer);
				}

				var subFolders = rootFolder.subFolders; // nsIMsgFolder
				while (subFolders.hasMoreElements()) {
					var folder = (
						subFolders
							.getNext()
							.QueryInterface(Components.interfaces.nsIMsgFolder)
					);
					var prettyName = folder.prettiestName;
					var URI = folder.URI;

					if (prettyName == "Inbox") {
						var status = document.createElement("hbox");
						status.className = "faces";

						var a = document.createElementNS("http://www.w3.org/1999/xhtml", 'a');
						var vbox = document.createElement("vbox");
						var hbox = document.createElement("hbox");
						var image = document.createElement("image");

						var src;
						if (folder.getNumUnread(true) != 0) {
							src = "img/mail.gif";
						} else {
							src = "img/mail_none.gif";
						}

						vbox.setAttribute(
							"tooltiptext",
							rootFolder.prettiestName
						);
						// a.href = URI;
						image.setAttribute(
							"src",
							src
						);
						image.setAttribute(
							"id",
							rootFolder.prettiestName + "-image"
						);

						hbox.appendChild(image);
						vbox.appendChild(hbox);
						a.appendChild(vbox);
						status.appendChild(a);
						folderContainer.appendChild(status);

						mailCheck(folder);
						break;
					}
				}
			}
		}
	} else {
		// Gecko < 17
		for (var i = 0; i < accounts.Count(); i++) {
			var account = accounts.QueryElementAt(i, Components.interfaces.nsIMsgAccount);
		}
	}
}

mail();

function mailCheck(folder) {
	var shouldResize = false;
	var prettyName = folder.prettiestName;
	var numUnread = folder.getNumUnread(true);
	var abbrName = folder.abbreviatedName;
	var URI = folder.URI;

	var rootFolder = folder.parent;
	var folderContainer = document.getElementById(folder.parent.abbreviatedName);

	var faces = document.getElementById(rootFolder.prettiestName + "-faces");
	if (faces) {
		folderContainer.removeChild(faces);
	}

	var rootImage = document.getElementById(rootFolder.prettiestName + "-image");
	var src;

	if (numUnread != 0) {
		src = "img/mail.gif";
	} else {
		src = "img/mail_none.gif";
	}
	rootImage.setAttribute("src", src);

	if (numUnread != 0) {
		faces = document.createElement("hbox");

		faces.className = "faces";
		faces.setAttribute("id", rootFolder.prettiestName + "-faces");

		// http://mozilla.6506.n7.nabble.com/Upcoming-change-to-fixIterator-function-in-iteratorUtils-jsm-td367711.html
		for (
			let msgHdr of fixIterator(
				folder.messages,
				Components.interfaces.nsIMsgDBHdr
			)
		) {
			if (!msgHdr.isRead) {
				// folder.URI
				// imap://duncjo01@outlook.office365.com/INBOX

				// TODO: this returns an incorrect value in SeaMonkey 2.53.6
				// https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIMsgFolder
				// https://github.com/mozilla/releases-comm-central/blob/master/mailnews/base/public/nsIMsgFolder.idl
				// http://forums.mozillazine.org/viewtopic.php?f=3&t=3048850
				// imap://duncjo01@outlook.office365.com:993/fetch%3EUID%3E/INBOX#66531

				// imap-message://duncjo01@outlook.office365.com/INBOX#66531
				var msgURI = folder.getUriForMsg(msgHdr);
				// imap-message://duncjo01@outlook.office365.com/INBOX#66531
				// var messageURI = folder.generateMessageURI(msgHdr.messageKey);
				// imap-message://duncjo01@outlook.office365.com/INBOX#66531
				// var messageURI = Components.classes["@mozilla.org/network/io-service;1"].
				// 	getService(Components.interfaces.nsIIOService).
				// 	newURI(msgURI, null, null);

				shouldResize = true;
				var sender = msgHdr.author;

				sender = sender.replace(/^.*\</, "");
				sender = sender.replace(/\>.*$/, "");
				sender = sender.toLowerCase();

				if (!sender.match(/.+\@.+/)) {
					console.log("Invalid sender address: '" + sender + "'.");
					return;
				}

				var atSign = sender.indexOf('@');
				var host = sender.substring(atSign + 1)
				var user = sender.substring(0, atSign);
				var picons = doPiconSearch(sender);

				var a = document.createElementNS("http://www.w3.org/1999/xhtml", 'a');
				var vbox = document.createElement("vbox");
				var hbox = document.createElement("hbox");
				var image = document.createElement("image");
				var label = document.createElement("label");

				vbox.setAttribute(
					"tooltiptext",
					sender
				);
				// a.href = msgURI;
				image.setAttribute(
					"src",
					picons[0]
				);
				label.setAttribute(
					"value",
					user.substring(0, 9)
				);

				hbox.appendChild(image);
				vbox.appendChild(hbox);
				vbox.appendChild(label);
				a.appendChild(vbox);
				faces.insertBefore(a, faces.firstChild);
			}
		}
		folderContainer.appendChild(faces);
	}
}

function doPiconSearch(sender) {
	// picon database folders
	var mfPiconDatabases = new Array("domains", "users", "misc", "usenix", "unknown");
	var picons = [];
	var atSign = sender.indexOf('@');

	// if we have a valid e-mail address..
	if (atSign != -1) {
		var host = sender.substring(atSign + 1);
		var user = sender.substring(0, atSign);
		// split the host up into pieces (we need this since hosts can be different lengths, i.e. cs.gettysburg.edu vs comcast.net, etc.)
		var host_pieces = host.split('.');

		// loop through the six different picon database folders
		for (var i in mfPiconDatabases) {
			// kill the "unknown" lookup if we already have a picon..
			if (
				mfPiconDatabases[i] == "unknown" &&
				(
					typeof picons !== "undefined" &&
					picons.length > 0
				)
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
			// we will check to see if we have a match at EACH depth, so keep a cloned version w/o the "unknown/face.gif" portion
			var clonedLocal;
			// loop through however many pieces we have of the host
			while (l >= 0) {
				// add that portion of the host (ex: "edu" or "gettysburg" or "cs")
				localFile.append(host_pieces[l]);
				clonedLocal = localFile.clone();

				// username for "users" db folder (non-standard)
				if (mfPiconDatabases[i] == "users") {
					localFile.append(user);
				} else {
					localFile.append("unknown");
				}
				localFile.append("face.gif");

				if (localFile.exists()) {
					picons.push(mfFileHandler.getURLSpecFromFile(localFile));
				}

				// revert back to old local URL (before above modifications)
				localFile = clonedLocal.clone();
				l--;
			}
		}

		// check to see if the array is empty
		if (
			!(
				typeof picons !== "undefined" &&
				picons.length > 0
			)
		) {
			var defaultMisc = mfLocalFolder.clone();
			defaultMisc.append("picons");

			// randomly set unknown address to default unknown picon or pjw face
			defaultMisc.append("unknown");
			defaultMisc.append("MISC");
			defaultMisc.append("unknown");
			defaultMisc.append("face.gif");
			picons.push(mfFileHandler.getURLSpecFromFile(defaultMisc));
		}
		return picons;
	}
}
