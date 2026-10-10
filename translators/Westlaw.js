{
	"translatorID": "fc9e5c87-2a77-450c-8a05-d48c58dbca69",
	"label": "Westlaw",
	"creator": "David Hawisher",
	"target": "^.*westlaw.*",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 10,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2026-10-10 20:28:51"
}

function detectWeb(doc, url) {
	// Icon shows only for cases, statutes, and regulations
	let head = ZU.xpathText(doc, '//title') || ''
	if (!head)
		return
	if (/\|\s*Cases\s*\|/i.test(head)) {
		return "case"
	}
	if (/\|\s*Statutes\s*\|/i.test(head)) {
		return "statute"
	}
	if (/\|\s*Regulations\s*\|/i.test(head)) {
		return "regulation"
	}
	// Restatements of the Law (American Law Institute) are secondary sources with no "| Cases |"-style marker in the title
	if (isRestatement(restatementHeading(doc))) {
		return "book"
	}
}

function isWestlawGatePage(doc) {
	let title = ZU.xpathText(doc, '//title') || ''
	let description = ZU.xpathText(doc, '//meta[@name="description"]/@content') || ''
	if (!title && /when being wrong is not an option/i.test(description)) {
		return true
	}
	return false
}

function getXPathStr(attr, elem, path) {
	let res = ZU.xpath(elem, path)
	res = res.length ? res[0][attr] : ''
	return res ? res : ''
}

function getSnapshotNote(title, doc) {
	let contentNode = doc.getElementById('document-content')
		|| doc.getElementById('co_document')
		|| doc.getElementById('co_contentColumn')
		|| doc.querySelector('main')
	if (!contentNode) return ''

	let snapshotNode = contentNode.cloneNode(true)
	let notesMarker = snapshotNode.querySelector('#co_notesOfDecisions')
	if (notesMarker && notesMarker.parentNode) {
		let cursor = notesMarker
		while (cursor) {
			let next = cursor.nextSibling
			cursor.parentNode.removeChild(cursor)
			cursor = next
		}
	}

	return 'Snapshot: ' + (title || '') + snapshotNode.innerHTML
}

function cleanText(str) {
	return (str || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim()
}

function doWeb(doc, url) {
	if (isWestlawGatePage(doc)) {
		ZU.debug('Westlaw translator: encountered BrowserHawk/login gate page with no document metadata')
		return
	}
	var type = detectWeb(doc, url)
	if (!type) {
		ZU.debug('Westlaw translator: unsupported or incomplete Westlaw page, no item type detected')
		return
	}
	var NewItem = new Zotero.Item(type)
	if (type == "book") {
		// a restatement: saved as the work (title without the section), as citation-phoenix's "restatement" type
		let heading = restatementHeading(doc)
		let parsed = parseRestatement(heading)
		let year = parsed.year || restatementCopyrightYear(doc)
		NewItem.title = fullRestatementTitle(doc, parsed.name)
		NewItem.creators.push({ lastName: 'American Law Institute', creatorType: 'author', fieldMode: 1 })
		NewItem.publisher = 'American Law Institute'
		if (year) NewItem.date = year
		if (parsed.edition) NewItem.edition = parsed.edition
		NewItem.extra = restatementExtra()
		if (parsed.section) {
			NewItem.notes.push({ note: 'Section: ' + restatementSectionName(doc, parsed.section) })
		}
		let snapshotNote = getSnapshotNote(heading, doc)
		if (snapshotNote) {
			NewItem.notes.push({ note: snapshotNote })
		}
		NewItem.complete()
	}
	if (type == "case") {
		NewItem.caseName = ZU.xpathText(doc, '//*[@id="co_docHeaderTitleLine"]')
			|| ZU.xpathText(doc, '//*[@id="title"]')
			|| ZU.xpathText(doc, '//meta[@property="og:title"]/@content')
			|| ZU.xpathText(doc, '//title')
			|| ''
		NewItem.caseName = NewItem.caseName.replace(/\s+\|\s+Cases\s+\|.*$/, '').trim()
		let snapshotNote = getSnapshotNote(NewItem.caseName, doc)
		if (snapshotNote) {
			NewItem.notes.push({ note: snapshotNote })
		}
		let citationArray = []
		let citationNodes = ZU.xpath(doc, '//*[@id="co_docHeaderCitation"]//*[starts-with(@id, "cite")]')
		for (let node of citationNodes) {
			let cite = cleanText(node.textContent)
			if (cite) citationArray.push(cite)
		}
		if (!citationArray.length) {
			for (let i = 0; i < 6; i++) {
				let cite = cleanText(ZU.xpathText(doc, '//*[@id="cite' + i + '"]'))
				if (cite) citationArray.push(cite)
			}
		} 
		NewItem.date = cleanText(ZU.xpathText(doc, '//*[@id="filedate"]'))
		NewItem.filingDate = NewItem.date //Need this to make a shortened bluebook citation style work 
		let court = cleanText(ZU.xpathText(doc, '//*[@id="courtline"]')).replace(/\.$/g, "")
		let note = getAnnotations(doc)
		if (note) { NewItem.notes.push({'note': note, 'tags': ['note']}) }
		Object.assign(NewItem, parseCitations(citationArray))
		NewItem.shortTitle = shortTitle(NewItem.caseName)
		NewItem.court = court
		NewItem.url = westlawURL(NewItem)
		NewItem.complete()
	}
	if (type == "regulation" || type == "statute") {
		var cite = cleanText(ZU.xpathText(doc, '//*[@id="cite"]'))
			|| cleanText(ZU.xpathText(doc, '//*[@id="co_docHeaderCitation"]//*[starts-with(@id, "cite")][1]'))
			|| cleanText(ZU.xpathText(doc, '//div[contains(@class, "co_cites")]/text()'))
		var effectiveDate = cleanText(ZU.xpathText(doc, '//*[@id="effectiveDate"]/text()'))
			|| cleanText(ZU.xpathText(doc, '//div[contains(@class, "co_effectiveDate")]/text()'))
		effectiveDate = effectiveDate.replace(/^Effective:\s*/i, '').trim()

		let title = cleanText(ZU.xpathText(doc, '//*[@id="co_docHeaderTitleLine"]'))
			|| cleanText(ZU.xpathText(doc, '//*[contains(@class, "co_title")]'))
			|| cleanText(ZU.xpathText(doc, '//meta[@property="og:title"]/@content'))
		title = title.replace(/\s+\|\s+(Statutes|Regulations)\s+\|.*$/i, '').trim()

		let codeSetName = cleanText(ZU.xpathText(doc, '//*[@id="codeSetName"]'))
			|| cleanText(ZU.xpathText(doc, '//*[@id="co_prelimContainer"]//a[1]'))

		if (title) {
			NewItem.title = title
		}
		if (codeSetName && statuteCompilations[codeSetName]) {
			NewItem.code = statuteCompilations[codeSetName]
		}

		let snapshotNote = getSnapshotNote(title || cite || NewItem.title || '', doc)
		if (snapshotNote) {
			NewItem.notes.push({ note: snapshotNote })
		}
		try {
			var code = cite.match(codeRex)[1]
			var codeNumPointer = codeRexMap[code][1]
			var sectionPointer = codeRexMap[code][2]
			if (codeNumPointer) {
				var codeNum = cite.match(codeRexMap[code][0])[codeNumPointer]
			}
			if (sectionPointer) {
				var section = cite.match(codeRexMap[code][0])[sectionPointer]
			}
			if (!section) {
				section = cite
			}
			if (!codeNum) {
				codeNum = []
			}
			if (section) {
				section = section.replace("-", "\\-")
			}
			if (abbrevMap[code]) {
				code = abbrevMap[code]
			}
			if (!NewItem.code) {
				NewItem.code = code
			}
			NewItem.codeNumber = codeNum
			NewItem.section = section
			if (!NewItem.title) {
				NewItem.title = cite
			}
		} catch (err) {
			if (!NewItem.title) {
				NewItem.title = cite
			}
		}
		NewItem.publicationDate = effectiveDate
		if (NewItem.codeNumber && NewItem.code && NewItem.section) {
			NewItem.url = "https://1.next.westlaw.com/Search/Results.html?query=find:"
				+ NewItem.codeNumber + "%20" + NewItem.code + "%20" + NewItem.section + "#autoLogin"
		}
		NewItem.complete()
	}
}

//Get case highlighting and associated page numbers and use as note for Zotero item. This is really useful.
function getAnnotations(doc) {
	let annotations = Array.prototype.slice.call(doc.getElementsByClassName('co_hl'))
	let arr = []
	let text = ''
	let page = ''
	if (annotations.length > 0) {
		annotations.forEach((item, index) => {
			let id = item.getAttribute('data-annotationid')
			let next = annotations[index + 1] || false
			let idNext = ''
			idNext = (next ? annotations[index + 1].getAttribute('data-annotationid') : '')
			text += item.innerText
			page = page || getPageNumber(item, doc)
			if (id !== idNext) {
				arr.push({ 'id': id, 'text': text.trim(), 'page': page })
				page = ''
		text = ''
			}
		})
	}
	if (arr.length > 0) {
		let note = ''
		for (b of arr) {
			note += `<p><blockquote>${b.text} [${b.page}]</blockquote></p>`
		}
		return note
	}
}

function getPageNumber(ele, doc) { //for now this is only used for annotations. We get the page number of each annotation by iterating through the page numbers in the document until we find one that occurs after the start of our annotation.
	let page = ""
	let pageNumbers = doc.getElementsByClassName('co_starPage')
	let comparison = 0
	for (pageNumber of pageNumbers) {
		if(pageNumber.innerText.indexOf('**') === -1) {
			comparison = pageNumber.compareDocumentPosition(ele)
			if (comparison === 4) {
				page = pageNumber.innerText
			} else {
				return page
			}
		}
	}
}

//Case Names
function shortTitle(caseName) {
	if (!caseName) { return '' }
	let vStart = caseName.indexOf(' v. ')
	if (vStart === -1) { return ''}
	let vEnd = vStart + 4
	let parties = []
	parties.push(caseName.slice(0, vStart))
	parties.push(caseName.slice(vEnd, caseName.length))
	if (parties[0].length - parties[1].length > 9) { parties.reverse() } // we want to save space, but there is a preference for using the first party's name unless it would save noticeable space to use the second party's. 
	if (!(govPattern.test(parties[0]))) {
		return shortParty(parties[0])
	} else if (!(govPattern.test(parties[1]))) {
		return shortParty(parties[1])
	} else {
		return
	}
}
function shortParty(p) {
	if (govPattern.test(p)) { return false }
	while (trimPattern.test(p)) { //we want to get rid of bloat like "co., LLP" from the end of party names.
		p = p.replace(trimPattern,"")
	}
	return p
}
 
//Case URLS
function westlawURL(item) { //some items (unpublished ones) will have Archive field info; others will have traditional volume/reporter info. This function works for both. It breaks if you have some of [reporter, volume, page] but not all.
	let reporter = item.reporter || item.archive
	let volume = item.volume || item.yearAsVolume
	let page = item.firstPage || item.archiveLocation
	return "https://1.next.westlaw.com/Search/Results.html?query=find:" + volume + "%20" + reporter + "%20" + page + "#autoLogin"
}



//Restatements of the Law (American Law Institute). The functions from isRestatement to restatementExtra are shared
//with translators/Lexis+.js (scripts/test-restatement-translators.html checks that the copies agree).

//The heading that names the work. A secondary-source page puts the section's name in <title> ("§ 18:2. Anti-assignment-in-gross
//rule | Secondary Sources | ..."), and the work in the citation line (.co_cites, "2 McCarthy on Trademarks § 18:2 (5th ed.)") and
//the publication line, so look there first: "Restatement (Second) of Torts § 402A (1965)".
function restatementHeading(doc) {
	let candidates = [
		cleanText(ZU.xpathText(doc, '//*[contains(@class, "co_cites")]')),
		cleanText(ZU.xpathText(doc, '//*[contains(@class, "co_publicationLine")]//*[contains(@class, "co_headtext")]')),
		cleanText(ZU.xpathText(doc, '//*[@id="co_docHeaderTitleLine"]')),
		cleanText(ZU.xpathText(doc, '//meta[@property="og:title"]/@content')),
		cleanText(ZU.xpathText(doc, '//title'))
	]
	for (let candidate of candidates) {
		let line = candidate.replace(/\s+\|\s+.*$/, '')
		if (isRestatement(line)) return line
	}
	return ''
}

//Westlaw's citation line abbreviates ("Restatement (Third) of Torts: Phys. & Emot. Harm § 34 (2010)"), but the breadcrumb above the
//text, in document order series > work > chapter > section, has the work's full title ("... Liability for Physical and Emotional Harm").
function fullRestatementTitle(doc, name) {
	let base = name.split(':')[0]
	for (let node of ZU.xpath(doc, '//*[contains(@class, "co_headtext")]')) {
		let candidate = cleanText(node.textContent)
		if (candidate === name || (name.indexOf(':') > -1 && candidate.indexOf(base + ':') === 0)) return candidate
	}
	return name
}

//"§ 34 Intervening Acts and Superseding Causes": the section with its heading, from the page's title element
function restatementSectionName(doc, section) {
	let node = ZU.xpath(doc, '//*[@id="title"]')[0]
	let title = node ? cleanText(node.textContent) : ''
	return title.indexOf(section) === 0 ? title : section
}

function isRestatement(heading) {
	return /^\s*Restat(?:ement)?s?\b/i.test(heading || '')
}

var RESTATEMENT_SERIES = { '1st': 'First', '2d': 'Second', '2nd': 'Second', '3d': 'Third', '3rd': 'Third', '4th': 'Fourth',
	'first': 'First', 'second': 'Second', 'third': 'Third', 'fourth': 'Fourth' }

//"Restatement of the Law 2d, Torts" and "Restatement 2d of Torts" (Lexis+) -> "Restatement (Second) of Torts"
function normalizeRestatementName(name) {
	let n = (name || '').replace(/\s+/g, ' ').trim()
	let m = /^Restat(?:ement)?(?: of the Law)?,?\s+(1st|2d|2nd|3d|3rd|4th|First|Second|Third|Fourth)\b,?\s+(?:of\s+)?(.+)$/i.exec(n)
	if (m) return 'Restatement (' + RESTATEMENT_SERIES[m[1].toLowerCase()] + ') of ' + m[2]
	return n
}

//-> { name, section, year, edition } from a heading such as
//  "Restatement (Second) of Torts § 402A (1965)", "Restatement of the Law, Copyright § 1 (Tentative Draft No. 2, 2021)"
//  or (Lexis+) "Restatement of the Law 2d, Torts § 402A. Special Liability of Seller of Product ...".
//The item is the work, so the section is returned separately and left out of the name.
function parseRestatement(raw) {
	let t = (raw || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
	let year = '', edition = '', section = ''
	//a trailing parenthetical with the year and/or the draft: (1965), (Tentative Draft No. 2, 2021)
	let paren = /\s*\(([^()]*)\)\s*$/.exec(t)
	if (paren && /\b(?:1[89]|20)\d\d\b|\bdraft\b/i.test(paren[1])) {
		let y = /\b((?:1[89]|20)\d\d)\b/.exec(paren[1])
		let d = /((?:Tentative|Council|Discussion|Preliminary|Proposed Final|Final)\s+Draft(?:\s+No\.?\s*\d+)?)/i.exec(paren[1])
		if (y) year = y[1]
		if (d) edition = d[1].replace(/\s+/g, ' ').trim()
		t = t.slice(0, paren.index)
	}
	//the section ("§ 402A", "§§ 1-5"); anything after it, such as Lexis+'s section heading, is dropped
	let sec = /\s*(§§?)\s*([0-9][0-9A-Za-z.\-–]*(?:\s*(?:,|and|to|-|–)\s*[0-9][0-9A-Za-z.\-–]*)*)/.exec(t)
	if (sec) {
		section = sec[1] + ' ' + sec[2].replace(/[.,]+$/, '').trim()
		t = t.slice(0, sec.index)
	}
	t = t.replace(/[,.:;\s]+$/, '')
	return { name: normalizeRestatementName(t), section: section, year: year, edition: edition }
}

//"Copyright © 1965 American Law Institute" in the text of the page
function restatementCopyrightYear(doc) {
	let text = (doc.body && doc.body.textContent) || ''
	let m = /(?:©|Copyright)\s*(?:\(c\))?\s*((?:1[89]|20)\d\d)[^.]{0,40}American Law Institute/i.exec(text)
	return m ? m[1] : ''
}

//The Extra field that marks the item as citation-phoenix's "restatement" type
function restatementExtra() {
	return 'mlzsync1:' + JSON.stringify({ xtype: 'restatement' })
}

//Helper Scripts to Parse Westlaw Text
function parseCitations(citationArray) { // this is a mess.
	let selectedCitation = {}
	let firstParsedCitation = null
	for (let citation of citationArray) {
		if(citation) {
			let normalizedCitation = citation.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim()
			let parsedCitation = normalizedCitation.match(/^(\d+)\s+([A-Za-z][A-Za-z0-9\.\-]*)\s+(\d+)$/)
			if (parsedCitation && !firstParsedCitation) {
				firstParsedCitation = {
					"volume": parsedCitation[1],
					"reporter": parsedCitation[2],
					"page": parsedCitation[3]
				}
			}
		}
	}
	if (!firstParsedCitation) {
		return selectedCitation
	}
	selectedCitation.volume = firstParsedCitation.volume
	selectedCitation.reporter = firstParsedCitation.reporter
	selectedCitation.firstPage = firstParsedCitation.page
	return selectedCitation
}

//Maps, Arrays, and Regex Patterns

//Helper patterns for Title and Case Name processing
var govPattern = /((city|county|cty.|state) of|(^state)|(^United States$)|(^U.S.$))/i 
var trimPattern = /(^( )|( |,|Inc.|Co.|LLC|LLLP|LLP)$)/mgi

//Helper array for using the preferred reporter.
var preferredReporters = [
	['NCBC', false], 
	['WL', false]
]

//Codes and Statutes
var codeRex = /(C\.F\.R\.|NCAC|U\.S\.C\.A\.|USCA|N\.C\.G\.S\.A\.|West\'s\sAnn\.Cal\.[a-zA-Z\.]+\sCode)/
var codeRexMap = {
	"NCAC": [/([0-9]+)(?:\sNCAC\s)([0-9\.]*)/, 1, 2],
	"C.F.R.": [/([0-9]+)(?:\sC\.F\.R\.[\s§]*)([0-9\.\-\–]*)/, 1, 2],
	"U.S.C.A.": [/([0-9]+)(?:\sU\.S\.C\.A\.[\s§]*)([0-9\.\-\–a-z]*)/, 1, 2],
	"USCA": [/([0-9]+)(?:\sUSCA[\s§]*)([0-9\.\-\–a-z]*)/, 1, 2],
	"N.C.G.S.A.": [/(?:N\.C\.G\.S\.A\.[\s§]*)([0-9\.\-\–a-zA-Z]*)/, "", 1],
	"West's Ann.Cal.Penal Code": [/(?:West's\sAnn\.Cal\.[a-zA-Z\.]*\sCode[\s§]*)([0-9a-z]*)/, "", 1]
}
var statuteCompilations = {
	"West's North Carolina General Statutes Annotated": "N.C.G.S.",
	"United States Code Annotated": "U.S.C.",
	"Massachusetts General Laws Annotated": "M.G.L."
}


//Fixing West's Abbreviations
var abbrevMap = {
	"NCAC": "N.C.A.C.",
	"U.S.C.A.": "U.S.C.",
	"USCA": "U.S.C.",
	"N.C.G.S.A.": "N.C.G.S.",
	"West's Ann.Cal.Penal Code": "Cal. Penal Code",
}

//code = code.match(/(?:[0-9]+\s)([A-Za-z\.]+)(?:\s*[§0-9]+)/)[1]
//codeNum = codeNum.match(/([0-9\.\-]+)(?:[\.\s§]+)/)[1]
//section = code.match(/()/)[1]
//var code = ZU.xpathText(doc, '//div[@class="co_cites"]/text()')
//var section = ZU.xpathText(doc, '//title/text()')

/** BEGIN TEST CASES **/
var testCases = [
]
/** END TEST CASES **/
