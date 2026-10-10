{
	"translatorID": "95a06782-5c7c-449d-851f-2a70898c6e47",
	"label": "EUR-Lex",
	"creator": "jnsheff",
	"target": "^https?://eur-lex\\.europa\\.eu/(legal-content/[A-Za-z-]+/(TXT|ALL|AUTO)(/HTML)?/|eli/)",
	"minVersion": "5.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2026-10-04 17:00:00"
}

/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2026 jnsheff

	This file is part of Zotero.

	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero. If not, see <http://www.gnu.org/licenses/>.

	***** END LICENSE BLOCK *****
*/

/*
	Saves a regulation, directive or decision from EUR-Lex (the text of an act as published in the
	Official Journal of the European Union) as a citation-phoenix `regulation` item.

	The title block of the Official Journal text is read, because it is present on every form of the
	page (the TXT/ALL page, the HTML text, the ELI page) and in both the pre-2023 and the 2023-onward
	Official Journal layouts:

		REGULATION (EU) 2016/679 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL   <- designation
		of 27 April 2016                                                         <- date of adoption
		on the protection of natural persons ...                                 <- title proper

	plus the page header (publication date, "L 119/1", or the 2024/1689 form), the CELEX number
	(meta WT.z_docID) and the ELI link.

	Data is arranged for Bluebook rule 21.9 ("Council Directive 90/476, art. 5, 1990 O.J. (L 266) 1, 2 (EC)"):

		title             the title proper, in title case (the part after the date)
		regulationType    Regulation, Directive, Decision (with "Delegated", "Implementing")
		regulatoryBody    the issuing institution, for a single institution
		creators          joint acts: each institution as a "contributor"
		publicLawNumber   the bare number, "2016/679" (not "(EU) 2016/679")
		dateEnacted       the date of adoption
		publicationDate   the date of publication in the Official Journal (its year is the O.J. volume)
		code              O.J.
		pages             the page range in the Official Journal, if shown
		seriesIssue       series and issue, "L 119" (new field, see the schema)
		publisher         the legal order: EU, EC, EEC, Euratom
		Extra             jurisdiction: eu.int; CELEX
*/

var MONTHS = {
	january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
	september: 9, october: 10, november: 11, december: 12
};

var SMALL = { and: 1, of: 1, the: 1 };

function clean(s) {
	return (s || '').replace(/[ \s]+/g, ' ').trim();
}

function titleCase(s) {
	return clean(s).toLowerCase().split(' ').map(function (w, i) {
		return (i > 0 && SMALL[w]) ? w : w.charAt(0).toUpperCase() + w.slice(1);
	}).join(' ');
}

// Bluebook rule 21.9 cites an act by its bare number: "(EU) 2016/679" -> "2016/679",
// "(EC) No 45/2001" -> "45/2001", "93/13/EEC" -> "93/13".
function bareNumber(number) {
	return number
		.replace(/^\((?:EU|EC|EEC|EURATOM|ECSC)\)\s*/i, '')
		.replace(/^No\.?\s*/i, '')
		.replace(/\/(?:EEC|EC|EU|EURATOM|ECSC)$/i, '')
		.trim();
}

// The Official Journal prints the title proper in lower case ("on the protection of ...");
// the Bluebook gives it in title case, keeping a leading preposition ("on the Deliberate
// Release ..."). Words that are already capitalised or contain digits are left alone.
var LOWER = { a: 1, an: 1, and: 1, as: 1, at: 1, but: 1, by: 1, for: 1, from: 1, in: 1, into: 1,
	of: 1, on: 1, or: 1, the: 1, to: 1, under: 1, with: 1 };
function bluebookTitle(s) {
	var first = true;
	return s.replace(/[A-Za-z][A-Za-z'\u2019-]*/g, function (w, off, all) {
		var low = w.toLowerCase();
		var wasFirst = first;
		first = false;
		if (w !== low) return w;
		if (LOWER[low] && (wasFirst || all.charAt(off - 1) !== '(')) return w;
		return w.charAt(0).toUpperCase() + w.slice(1);
	});
}

function meta(doc, name) {
	var m = doc.querySelector('meta[name="' + name + '"]');
	return m ? clean(m.getAttribute('content')) : '';
}

// The paragraphs of the title block, in order.
function titleLines(doc) {
	var block = doc.querySelector('.eli-main-title');
	var ps = block ? block.querySelectorAll('p.oj-doc-ti') : doc.querySelectorAll('p.oj-doc-ti');
	var lines = [];
	for (var i = 0; i < ps.length; i++) {
		var t = clean(ps[i].textContent);
		if (t) lines.push(t);
	}
	return lines;
}

// "REGULATION (EU) 2016/679 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL",
// "COUNCIL DIRECTIVE 93/13/EEC", "COMMISSION DELEGATED REGULATION (EU) 2019/980"
function parseDesignation(line) {
	var m = line.match(/^(?:(COUNCIL|COMMISSION|EUROPEAN PARLIAMENT|EUROPEAN CENTRAL BANK)\s+)?((?:DELEGATED |IMPLEMENTING )?(?:REGULATION|DIRECTIVE|DECISION))\s+(.+?)(?:\s+OF THE\s+(EUROPEAN PARLIAMENT AND OF THE COUNCIL|EUROPEAN PARLIAMENT|COUNCIL|COMMISSION|EUROPEAN CENTRAL BANK))?$/i);
	if (!m) return null;
	var type = titleCase(m[2]);
	var institution = m[4] ? titleCase(m[4]) : (m[1] ? titleCase(m[1]) : '');
	return { type: type, number: clean(m[3]), institution: institution };
}

function parseAdoptionDate(line) {
	var m = line.match(/^of\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i);
	if (!m || !MONTHS[m[2].toLowerCase()]) return null;
	return { day: parseInt(m[1], 10), month: MONTHS[m[2].toLowerCase()], year: parseInt(m[3], 10) };
}

function isoDate(d) {
	return d.year + '-' + ('0' + d.month).slice(-2) + '-' + ('0' + d.day).slice(-2);
}

// Pre-2023 header: "L 119/1".  From 2023: series "L" and number "2024/1689", no page.
function parseOJ(doc) {
	var oj = {};
	var el = doc.querySelector('.oj-hd-oj');
	var m = el && clean(el.textContent).match(/^([A-Z])\s+(\d+)\/(\d+)$/);
	if (m) {
		oj.series = m[1]; oj.issue = m[2]; oj.page = m[3];
	}
	else {
		var uniq = doc.querySelector('.oj-hd-uniq');
		var coll = doc.querySelector('.oj-hd-coll');
		var series = coll && clean(coll.textContent).match(/^([A-Z])\s+series/i);
		if (uniq && series) {
			oj.series = series[1].toUpperCase();
			oj.issue = clean(uniq.textContent);
		}
	}
	var d = doc.querySelector('.oj-hd-date');
	var dm = d && clean(d.textContent).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
	if (dm) {
		oj.pubDay = parseInt(dm[1], 10); oj.pubMonth = parseInt(dm[2], 10); oj.year = parseInt(dm[3], 10);
	}
	// "OJ L 119, 4.5.2016, pp. 1-88" gives the extent of the act
	var text = doc.body ? doc.body.textContent : '';
	var pm = text.match(/OJ\s+[A-Z]\s+\d+,\s+\d{1,2}\.\d{1,2}\.\d{4},\s+pp?\.\s*(\d+)(?:\s*[–—-]\s*(\d+))?/);
	if (pm) oj.pages = pm[2] ? pm[1] + '–' + pm[2] : pm[1];
	return oj;
}

// The legal order in which the act was adopted: EU since the Treaty of Lisbon.
function legalOrder(number, adopted) {
	var n = number.toUpperCase();
	if (/EURATOM/.test(n)) return 'Euratom';
	if (/ECSC/.test(n)) return 'ECSC';
	if (/\(EU\)|\/EU\b|\/EU$/.test(n)) return 'EU';
	if (/\(EEC\)|\/EEC\b/.test(n)) return 'EEC';
	if (/\(EC\)|\/EC\b/.test(n)) return 'EC';
	if (adopted && (adopted.year > 2009 || (adopted.year == 2009 && adopted.month == 12))) return 'EU';
	return 'EC';
}

function monthName(n) {
	return Object.keys(MONTHS)[n - 1].replace(/^./, function (c) { return c.toUpperCase(); });
}

function isoPub(oj) {
	return oj.year ? oj.year + '-' + ('0' + oj.pubMonth).slice(-2) + '-' + ('0' + oj.pubDay).slice(-2) : '';
}

function scrape(doc, url) {
	var lines = titleLines(doc);
	if (!lines.length) return null;
	var des = parseDesignation(lines[0]);
	if (!des) return null;
	var adopted = lines[1] ? parseAdoptionDate(lines[1]) : null;
	var name = lines[adopted ? 2 : 1] || '';
	var oj = parseOJ(doc);
	var celex = meta(doc, 'WT.z_docID');
	if (!celex) {
		var cm = url.match(/CELEX[:%3A]+(\w+)/i);
		celex = cm ? cm[1] : '';
	}
	var eli = '';
	var a = doc.querySelector('a[href*="data.europa.eu/eli/"]');
	if (a) eli = a.getAttribute('href').replace(/^http:/, 'https:');
	var number = bareNumber(des.number);
	var order = legalOrder(des.number, adopted);
	var joint = /Parliament/.test(des.institution);

	var item = new Zotero.Item('regulation');
	item.title = name ? bluebookTitle(name) : des.type + ' ' + number;
	item.regulationType = des.type;
	if (!joint && des.institution) item.regulatoryBody = des.institution;
	item.publicLawNumber = number;
	item.code = 'O.J.';
	if (adopted) item.dateEnacted = isoDate(adopted);
	if (oj.year) item.publicationDate = isoPub(oj);
	if (oj.pages) item.pages = oj.pages;
	else if (oj.page) item.pages = oj.page;
	if (oj.series && oj.issue) item.seriesIssue = oj.series + ' ' + oj.issue;
	item.publisher = order;
	item.language = meta(doc, 'WT.z_usr_lan') || 'en';
	item.url = eli || url.replace(/#.*$/, '');
	if (joint) {
		item.creators.push({ lastName: 'European Parliament', fieldMode: 1, creatorType: 'contributor' });
		item.creators.push({ lastName: 'Council', fieldMode: 1, creatorType: 'contributor' });
	}
	var extra = ['jurisdiction: eu.int'];
	if (celex) extra.push('CELEX: ' + celex);
	item.extra = extra.join('\n');
	item.attachments.push({ title: 'EUR-Lex page', document: doc });
	return item;
}

function detectWeb(doc, url) {
	return scrape(doc, url) ? 'regulation' : false;
}

function doWeb(doc, url) {
	var item = scrape(doc, url);
	if (item) item.complete();
}
