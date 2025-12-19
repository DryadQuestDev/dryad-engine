//jsonrepair lib
!function (n, e) { "object" == typeof exports && "undefined" != typeof module ? module.exports = e() : "function" == typeof define && define.amd ? define(e) : (n = "undefined" != typeof globalThis ? globalThis : n || self).jsonrepair = e() }(this, function () { "use strict"; function t(n, e) { if (!(this instanceof t)) throw new SyntaxError("Constructor must be called with the new operator"); this.message = n + " (char " + e + ")", this.char = e, this.stack = (new Error).stack } (t.prototype = new Error).constructor = Error; var i = { "'": !0, "‘": !0, "’": !0, "`": !0, "´": !0 }, f = { '"': !0, "“": !0, "”": !0 }; function o(n) { return e.test(n) } var e = /^[a-zA-Z_]$/; var u = /^[0-9a-fA-F]$/; function c(n) { return r.test(n) } var r = /^[0-9]$/; function s(n) { return " " === n || "\t" === n || "\n" === n || "\r" === n } function a(n) { return " " === n || " " <= n && n <= " " || " " === n || " " === n || "　" === n } function l(n) { return !0 === i[n] } function h(n) { return !0 === f[n] } function d(n) { return !0 === i[n] ? "'" : !0 === f[n] ? '"' : n } function n(n, e) { e = n.lastIndexOf(e); return -1 !== e ? n.substring(0, e) + n.substring(e + 1) : n } function w(n, e) { var r = n.length; if (!s(n[r - 1])) return n + e; for (; s(n[r - 1]);)r--; return n.substring(0, r) + e + n.substring(r) } var g = 0, b = 1, p = 2, v = 3, x = 4, m = 5, y = 6, k = { "": !0, "{": !0, "}": !0, "[": !0, "]": !0, ":": !0, ",": !0, "(": !0, ")": !0, ";": !0, "+": !0 }, I = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" }, E = { "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t" }, j = { null: "null", true: "true", false: "false" }, A = { None: "null", True: "true", False: "false" }, $ = "", O = "", T = 0, C = "", F = "", S = y; function U() { T++, C = $.charAt(T) } function z() { return S === g && ("[" === F || "{" === F) || S === p || S === b || S === v } function N() { O += F, S = y, F = "", k[C] ? (S = g, F = C, U()) : function () { if (c(C) || "-" === C) { if (S = b, "-" === C) { if (F += C, U(), !c(C)) throw new t("Invalid number, digit expected", T) } else "0" === C && (F += C, U()); for (; c(C);)F += C, U(); if ("." === C) { if (F += C, U(), !c(C)) throw new t("Invalid number, digit expected", T); for (; c(C);)F += C, U() } if ("e" === C || "E" === C) { if (F += C, U(), "+" !== C && "-" !== C || (F += C, U()), !c(C)) throw new t("Invalid number, digit expected", T); for (; c(C);)F += C, U() } } else !function () { if (function (n) { return !0 === i[n] || !0 === f[n] }(C)) { var n = d(C), e = l(C) ? l : h; for (F += '"', S = p, U(); "" !== C && !e(C);)if ("\\" === C) if (U(), void 0 !== I[C]) F += "\\" + C, U(); else if ("u" === C) { F += "\\u", U(); for (var r = 0; r < 4; r++) { if (!function (n) { return u.test(n) }(C)) throw new t("Invalid unicode character", T - F.length); F += C, U() } } else { if ("'" !== C) throw new t('Invalid escape character "\\' + C + '"', T); F += "'", U() } else E[C] ? F += E[C] : F += '"' === C ? '\\"' : C, U(); if (d(C) !== n) throw new t("End of string expected", T - F.length); return F += '"', U(), 0 } !function () { if (o(C)) for (S = v; o(C) || c(C) || "$" === C;)F += C, U(); else !function () { if (s(C) || a(C)) for (S = x; s(C) || a(C);)F += C, U(); else !function () { if ("/" === C && "*" === $[T + 1]) { for (S = m; "" !== C && ("*" !== C || "*" === C && "/" !== $[T + 1]);)F += C, U(); return "*" === C && "/" === $[T + 1] && (F += C, U(), F += C, U()) } if ("/" !== C || "/" !== $[T + 1]) !function () { for (S = y; "" !== C;)F += C, U(); throw new t('Syntax error in part "' + F + '"', T - F.length) }(); else for (S = m; "" !== C && "\n" !== C;)F += C, U() }() }() }() }() }(), S === x && (F = function (n) { for (var e = "", r = 0; r < n.length; r++) { var t = n[r]; e += a(t) ? " " : t } return e }(F), N()), S === m && (S = y, F = "", N()) } function V() { if (S !== g || "{" !== F) !function () { if (S === g && "[" === F) { if (N(), S === g && "]" === F) return N(); for (; ;)if (V(), S === g && "," === F) { if (N(), S === g && "]" === F) { O = n(O, ","); break } } else { if (!z()) break; O = w(O, ",") } return S === g && "]" === F ? N() : O = w(O, "]") } !function () { if (S !== p) !(S === b ? N() : void function () { if (S === v) { if (j[F]) return N(); if (A[F]) return F = A[F], N(); var n = F, e = O.length; if (F = "", N(), S === g && "(" === F) return F = "", N(), V(), S === g && ")" === F && (F = "", N(), S === g && ";" === F && (F = "", N())); for (O = function (n, e, r) { return n.substring(0, r) + e + n.substring(r) }(O, '"'.concat(n), e); S === v || S === b;)N(); return O += '"' } !function () { throw new t("" === F ? "Unexpected end of json string" : "Value expected", T - F.length) }() }()); else for (N(); S === g && "+" === F;) { var n; F = "", N(), S === p && (n = O.lastIndexOf('"'), O = O.substring(0, n) + F.substring(1), F = "", N()) } }() }(); else if (N(), S !== g || "}" !== F) { for (; ;) { if (S !== v && S !== b || (S = p, F = '"'.concat(F, '"')), S !== p) throw new t("Object key expected", T - F.length); if (N(), S === g && ":" === F) N(); else { if (!z()) throw new t("Colon expected", T - F.length); O = w(O, ":") } if (V(), S === g && "," === F) { if (N(), S === g && "}" === F) { O = n(O, ","); break } } else { if (S !== p && S !== b && S !== v) break; O = w(O, ",") } } S === g && "}" === F ? N() : O = w(O, "}") } else N() } return function (n) { if (O = "", T = 0, C = ($ = n).charAt(0), F = "", S = y, N(), n = S === g && "{" === F, V(), "" === F) return O; if (n && z()) { for (var e = ""; z();)e += O = w(O, ","), O = "", V(); return "[\n".concat(e).concat(O, "\n]") } throw new t("Unexpected characters", T - F.length) } });

// Helper function to get cursor or selection element
function getCursorOrSelectionElement(doc) {
    var cursor = doc.getCursor();
    if (cursor) {
        var element = cursor.getElement();
        return { element: element, parent: element.getParent() };
    }

    // If no cursor, check for selection
    var selection = doc.getSelection();
    if (selection) {
        var rangeElements = selection.getRangeElements();
        if (rangeElements.length > 0) {
            var element = rangeElements[0].getElement();
            // If the element is a Text, get its parent paragraph
            if (element.getType() === DocumentApp.ElementType.TEXT) {
                element = element.getParent();
            }
            return { element: element, parent: element.getParent() };
        }
    }

    return null;
}

function onOpen() {
    var ui = DocumentApp.getUi();

    ui.createMenu('Content Tables')
        .addItem('Room', 'roomTable')
        .addItem('Encounter', 'encounterTable')
        .addItem('Interaction', 'interactionTable')
        .addItem('Event', 'eventTable')
        .addItem('NextScene', 'sceneOne')
        .addItem('NextScene(columns)', 'sceneCol')
        .addItem('NextScene(rows)', 'sceneRow')
        .addItem('Template', 'variableTable')
        .addSeparator()
        .addItem('Quest Title', 'questTitle')
        .addItem('Quest Main Stage', 'questMainStage')
        .addItem('Quest Goal', 'questGoal')
        .addItem('Quest Goal Stage', 'questGoalStage')
        .addToUi();

    ui.createMenu('Convert')
        .addItem('Smart Quotes', 'smartQuotes')
        //.addItem('I to |I|', 'convertI')
        .addToUi();

    ui.createMenu('Toolbar')
        .addItem('Actions Usage', 'showActions')
        .addItem('Dungeon Flags', 'showFlags')
        .addItem('Anchors', 'showAnchors')
        .addItem('Inventories', 'showInventories')
        /*
             .addItem('Fights', 'showFights')
             
             .addItem('TODO', 'showTODO')
             
         */
        .addToUi();
    PropertiesService.getScriptProperties().setProperty('currentSceneCount', 1);
}


//EVENT TABLES BLOCK
function collectableTable() {
    var ui = DocumentApp.getUi();
    var result = ui.prompt("Collectable's Id:").getResponseText();
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { ui.alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;
    //here table is an array of cells like
    var titleName = `@collectable_1`;
    var choiceName = `!collect{collect: “${result}”}`;
    var cells = [
        [titleName],
        [choiceName],
        ["|description|, grows in the east part of this chamber"],
    ];
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    var row = table.getRow(0);

    var cell1 = row.getCell(0);
    cell1.editAsText().setBackgroundColor("#b4a7d6");
    table.getRow(1).getCell(0).editAsText().setBold(true);
    cell1.getChild(0).asParagraph().setHeading(DocumentApp.ParagraphHeading.HEADING3)

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(2).getCell(0), 0));

    //set grey bg
    //table.getRow(1).getCell(0).setBackgroundColor("#f3f3f3");
    //table.getRow(2).getCell(0).setBackgroundColor("#f3f3f3");

}

function lootTable() {
    var ui = DocumentApp.getUi();
    var result = ui.prompt("Loot's Id:").getResponseText();
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { ui.alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;
    //here table is an array of cells like
    var titleName = `@${result}_defeated{if: {_defeated$${result}: true}}`;
    var choiceName = `!loot{loot: “${result}”}`;
    var cells = [
        [titleName],
        [choiceName],
        ["At the south-east wall, *EnemyName* lies defeated, breathing shallowly"],
    ];
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    var row = table.getRow(0);

    var cell1 = row.getCell(0);
    cell1.editAsText().setBackgroundColor("#b4a7d6");
    table.getRow(1).getCell(0).editAsText().setBold(true);
    cell1.getChild(0).asParagraph().setHeading(DocumentApp.ParagraphHeading.HEADING3)

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(2).getCell(0), 0));

    //set grey bg
    //table.getRow(1).getCell(0).setBackgroundColor("#f3f3f3");
    //table.getRow(2).getCell(0).setBackgroundColor("#f3f3f3");

}



function roomTable() {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;
    //here table is an array of cells like
    var cells = [
        ['@description'],
        [""],

    ];
    var headerText = "^1"
    var header = body.insertParagraph(parent.getChildIndex(element), headerText).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    var table = body.insertTable(parent.getChildIndex(element), cells).setColumnWidth(0, 400);
    var row = table.getRow(0);

    var cell1 = row.getCell(0);
    cell1.editAsText().setBackgroundColor("#ffe599");
    cell1.getChild(0).asParagraph().setHeading(DocumentApp.ParagraphHeading.HEADING3)

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(1).getCell(0), 0));

    //set grey bg
    //table.getRow(1).getCell(0).setBackgroundColor("#f3f3f3");

}
function sceneOne() {
    let num = Number(PropertiesService.getScriptProperties().getProperty('currentSceneCount'));
    //DocumentApp.getUi().alert(num);
    PropertiesService.getScriptProperties().setProperty('currentSceneCount', num + 1);
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;

    var cells = [
        [num + "", '%\n'],
    ];

    var table = body.insertTable(parent.getChildIndex(element) + 1, cells);
    if (num < 10) {
        table.getRow(0).getCell(0).setWidth(10);
    } else {
        table.getRow(0).getCell(0).setWidth(25);
    }

    table.getRow(0).getCell(1).setWidth(390);

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(0).getCell(1), 1));

    //set grey bg
    //table.getRow(0).getCell(0).setBackgroundColor("#f3f3f3");
    //table.getRow(0).getCell(1).setBackgroundColor("#f3f3f3");
    let text = table.getRow(0).getCell(1).editAsText().findText('%');
    if (text) {
        text.getElement().asText().setBold(true);
    }


}

function sceneCol() {
    let num = Number(PropertiesService.getScriptProperties().getProperty('currentSceneCount'));
    PropertiesService.getScriptProperties().setProperty('currentSceneCount', num + 1);
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;


    var ui = DocumentApp.getUi();
    var result = ui.prompt("Size:");
    var response = result.getResponseText();
    if (!response) {
        return;
    }
    var cells = [
        [num + ""]
    ];
    for (let i = 0; i < response; i++) {
        cells[0].push("~choice\n");
    }
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    table.getRow(0).getCell(0).setWidth(10);

    //set grey bg
    for (let i = 0; i <= response; i++) {

        //table.getRow(0).getCell(i).setBackgroundColor("#f3f3f3");
        let text = table.getRow(0).getCell(i).editAsText().findText('~choice');
        if (text) {
            text.getElement().asText().setBold(true);
        }


    }

}



function sceneRow() {
    let num = Number(PropertiesService.getScriptProperties().getProperty('currentSceneCount'));
    PropertiesService.getScriptProperties().setProperty('currentSceneCount', num + 1);
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;


    var ui = DocumentApp.getUi();
    var result = ui.prompt("Size:");
    var response = result.getResponseText();
    if (!response) {
        return;
    }
    var cells = [
        [num + ""]
    ];
    for (let i = 0; i < response; i++) {
        cells.push(["~choice\n"]);
    }
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    //table.getRow(0).getCell(0).setWidth(550);

    //set grey bg
    for (let i = 0; i <= response; i++) {
        //table.getRow(i).getCell(0).setBackgroundColor("#f3f3f3");
        let text = table.getRow(i).getCell(0).editAsText().findText('~choice');
        if (text) {
            text.getElement().asText().setBold(true);
        }


    }


}


function eventTable() {
    PropertiesService.getScriptProperties().setProperty('currentSceneCount', 2);
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;


    //here table is an array of cells like
    var cells = [
        ['#event{if: true}'],
        ['1'],
        ["%\n"],

    ];
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    // Get the first row in the table.
    var row = table.getRow(0);
    // Get the two cells this row.
    var cell1 = row.getCell(0);

    cell1.editAsText().setBackgroundColor("#9fc5e8");


    cell1.getChild(0).asParagraph().setHeading(DocumentApp.ParagraphHeading.HEADING3)

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(2).getCell(0), 1));

    //set grey bg
    //table.getRow(1).getCell(0).setBackgroundColor("#f3f3f3");
    //table.getRow(2).getCell(0).setBackgroundColor("#f3f3f3");     
    table.getRow(2).getCell(0).editAsText().findText('%').getElement().asText().setBold(true);
}

function interactionTable() {
    PropertiesService.getScriptProperties().setProperty('currentSceneCount', 2);
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;


    //here table is an array of cells like
    var cells = [
        ['#encounter~choice'],
        ['1'],
        ["%\n"],

    ];
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    // Get the first row in the table.
    var row = table.getRow(0);
    // Get the two cells this row.
    var cell1 = row.getCell(0);

    cell1.editAsText().setBackgroundColor("#b6d7a8");


    cell1.getChild(0).asParagraph().setHeading(DocumentApp.ParagraphHeading.HEADING3)

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(2).getCell(0), 1));

    //set grey bg
    //table.getRow(1).getCell(0).setBackgroundColor("#f3f3f3");
    //table.getRow(2).getCell(0).setBackgroundColor("#f3f3f3");     
    table.getRow(2).getCell(0).editAsText().findText('%').getElement().asText().setBold(true);


    //cell1.getText().setHeading(DocumentApp.ParagraphHeading.HEADING3);

    //cell1.editAsText().deleteText(13, 13);
    //DocumentApp.getUi().alert(cell1.editAsText().getText().length);    

    //cell1.editAsText().getText().length

    //var position = doc.newPosition(table.getChild(0), 1);
    //doc.setCursor(position);

    // TableCell.merge() merges the current cell into its preceding sibling element.
    //var merged = cell2.merge();
    //body.insertTable(parent.getChildIndex(element) + 1, table)
    //"#FF0000"
    //DocumentApp.getActiveDocument().getCursor().insertText("qwetr")
    //DocumentApp.getUi().alert('You clicked the first menu item!');
}

function encounterTable() {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;
    //here table is an array of cells like
    var cells = [
        ['@encounter'],
        ['!choice'],
        [""],

    ];
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    var row = table.getRow(0);

    var cell1 = row.getCell(0);
    cell1.editAsText().setBackgroundColor("#b4a7d6");
    table.getRow(1).getCell(0).editAsText().setBold(true);
    cell1.getChild(0).asParagraph().setHeading(DocumentApp.ParagraphHeading.HEADING3)

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(2).getCell(0), 0));

    //set grey bg
    //table.getRow(1).getCell(0).setBackgroundColor("#f3f3f3");
    //table.getRow(2).getCell(0).setBackgroundColor("#f3f3f3");

}

function variableTable() {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;
    //here table is an array of cells like
    var cells = [
        ['$template'],
        [""],

    ];
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    var row = table.getRow(0);

    var cell1 = row.getCell(0);
    cell1.editAsText().setBackgroundColor("#b7b7b7");
    cell1.getChild(0).asParagraph().setHeading(DocumentApp.ParagraphHeading.HEADING3)

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(1).getCell(0), 0));

    //set grey bg
    //table.getRow(1).getCell(0).setBackgroundColor("#f3f3f3");

}

// QUEST
function questTitle() {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;

    var cells = [
        ['$quest_id.main'],
        [""],
    ];
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    var row = table.getRow(0);

    var cell1 = row.getCell(0);
    cell1.editAsText().setBackgroundColor("#00FFFF");
    cell1.getChild(0).asParagraph().setHeading(DocumentApp.ParagraphHeading.HEADING3)

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(1).getCell(0), 0));
}

function questMainStage() {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;

    var cells = [
        ['$quest_id.main.stage_id'],
        [""],
    ];
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    var row = table.getRow(0);

    var cell1 = row.getCell(0);
    cell1.editAsText().setBackgroundColor("#FFD580");
    cell1.getChild(0).asParagraph().setHeading(DocumentApp.ParagraphHeading.HEADING3)

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(1).getCell(0), 0));
}

function questGoal() {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;

    var cells = [
        ['$quest_id.goal_id'],
        [""],
    ];
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    var row = table.getRow(0);

    var cell1 = row.getCell(0);
    cell1.editAsText().setBackgroundColor("#FFFF00");
    cell1.getChild(0).asParagraph().setHeading(DocumentApp.ParagraphHeading.HEADING3)

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(1).getCell(0), 0));
}

function questGoalStage() {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    var pos = getCursorOrSelectionElement(doc);
    if (!pos) { DocumentApp.getUi().alert('Please place your cursor in the document'); return; }
    var element = pos.element;
    var parent = pos.parent;

    var cells = [
        ['$quest_id.goal_id.stage_id'],
        [""],
    ];
    var table = body.insertTable(parent.getChildIndex(element) + 1, cells).setColumnWidth(0, 400);
    var row = table.getRow(0);

    var cell1 = row.getCell(0);
    cell1.editAsText().setBackgroundColor("#FFD580");
    cell1.getChild(0).asParagraph().setHeading(DocumentApp.ParagraphHeading.HEADING3)

    //set Cursor
    doc.setCursor(doc.newPosition(table.getRow(1).getCell(0), 0));
}


//DATA BLOCK
function showFlags() {
    let docBody = DocumentApp.getActiveDocument().getBody();
    let varsArr = [];

    // Get full document text to handle multi-line JSON
    let fullText = docBody.getText();

    // Find all JSON blocks (including multi-line)
    let jsonBlocks = findJsonBlocks(fullText);

    for (let block of jsonBlocks) {
        let json = parseJson(block);
        if (!json) continue;

        for (const [key, value] of Object.entries(json)) {
            if (key == "flag" && typeof value === "string") {
                // Parse flag string: "button_examined = 1, button_pressed > 1"
                let flags = value.split(',');
                for (let flag of flags) {
                    // Extract flag name (before =, >, or <)
                    let match = flag.trim().match(/^([\w.]+)\s*[=><]/);
                    if (match && !varsArr.includes(match[1])) {
                        varsArr.push(match[1]);
                    }
                }
            }
        }
    }

    var html = HtmlService.createHtmlOutput(varsArr.join("<br>"))
        .setTitle('List of Flags');
    DocumentApp.getUi().showSidebar(html);
}

// Find all JSON blocks in text, including multi-line ones
function findJsonBlocks(text) {
    // Remove [code]...[/code] blocks first
    text = text.replace(/\[code\][\s\S]*?\[\/code\]/gmi, '');
    // Remove if statements
    text = text.replace(/(if|ifOr|else|fi){[^}]*}/gmi, '');

    let blocks = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (text[i] === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                blocks.push(text.substring(start, i + 1));
                start = -1;
            }
        }
    }

    return blocks;
}

// Find all JSON blocks with inline context (text before JSON on same line)
function findJsonBlocksWithContext(text) {
    // Remove [code]...[/code] blocks first
    text = text.replace(/\[code\][\s\S]*?\[\/code\]/gmi, '');
    // Remove if statements
    text = text.replace(/(if|ifOr|else|fi){[^}]*}/gmi, '');

    let results = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (text[i] === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                let block = text.substring(start, i + 1);

                // Find inline context (text before { on same line)
                let lineStart = start;
                while (lineStart > 0 && text[lineStart - 1] !== '\n') {
                    lineStart--;
                }
                let inlineContext = text.substring(lineStart, start).trimStart(); // Only trim leading, preserve trailing space

                // Find previous line as context if no inline context
                let prevLineContext = null;
                if (!inlineContext) {
                    let prevLineEnd = lineStart - 1;
                    if (prevLineEnd > 0) {
                        let prevLineStart = prevLineEnd;
                        while (prevLineStart > 0 && text[prevLineStart - 1] !== '\n') {
                            prevLineStart--;
                        }
                        prevLineContext = text.substring(prevLineStart, prevLineEnd).trim();
                    }
                }

                results.push({
                    block: block,
                    context: inlineContext || prevLineContext || null,
                    isInline: !!inlineContext
                });
                start = -1;
            }
        }
    }

    return results;
}


function showFights() {
    let docBody = DocumentApp.getActiveDocument().getBody();
    let varsArr = [];
    let paragraphs = docBody.getParagraphs();
    for (let i = 0; i < paragraphs.length; i++) {
        let text = paragraphs[i].getText();
        let json = parseJson(text);
        if (!json) continue;
        for (const [key, value] of Object.entries(json)) {
            if (key == "fight") {
                if (!varsArr.includes(value)) {
                    varsArr.push(value);
                }
            }
        }
    }

    var html = HtmlService.createHtmlOutput(varsArr.join("<br>"))
        .setTitle('List of Fights');
    DocumentApp.getUi()
        .showSidebar(html);
}

function showInventories() {
    let docBody = DocumentApp.getActiveDocument().getBody();
    let loots = [];
    let trades = [];

    // Get full document text to handle multi-line JSON
    let fullText = docBody.getText();
    let jsonBlocks = findJsonBlocks(fullText);

    for (let block of jsonBlocks) {
        let json = parseJson(block);
        if (!json) continue;
        for (const [key, value] of Object.entries(json)) {
            if (key == "loot") {
                if (!loots.includes(value)) {
                    loots.push(value);
                }
            }

            if (key == "trade") {
                if (!trades.includes(value)) {
                    trades.push(value);
                }
            }
        }
    }
    let output = `<b>Loots</b><br>${loots.join("<br>")}<br><br><b>Trades</b><br>${trades.join("<br>")}`;

    var html = HtmlService.createHtmlOutput(output)
        .setTitle('List of Inventories');
    DocumentApp.getUi()
        .showSidebar(html);
}


function showActions() {
    // Gather all unique action keys from JSON blocks
    let docBody = DocumentApp.getActiveDocument().getBody();
    let fullText = docBody.getText();
    let jsonBlocks = findJsonBlocks(fullText);

    let allKeys = new Set();
    for (let block of jsonBlocks) {
        let json = parseJson(block);
        if (!json) continue;
        for (const key of Object.keys(json)) {
            allKeys.add(key);
        }
    }

    let keysList = Array.from(allKeys).sort();
    let keysHtml = keysList.map(key =>
        `<div class="action-item" onclick="showUsages('${key}')">${key}</div>`
    ).join('');

    var formHtml = `
        <style>
            body { font-family: Arial, sans-serif; padding: 10px; }
            .action-item {
                padding: 8px 12px;
                margin: 4px 0;
                background: #f0f0f0;
                border-radius: 4px;
                cursor: pointer;
            }
            .action-item:hover { background: #e0e0e0; }
            .back-btn {
                padding: 6px 12px;
                margin-bottom: 10px;
                cursor: pointer;
                background: #ddd;
                border: none;
                border-radius: 4px;
            }
            .back-btn:hover { background: #ccc; }
            #results { margin-top: 10px; }
            .result-item {
                background: #f5f5f5;
                padding: 8px 12px;
                margin: 8px 0;
                border-radius: 4px;
                border-left: 3px solid #4285f4;
                cursor: pointer;
            }
            .result-item:hover { background: #e8e8e8; }
        </style>
        <div id="list">${keysHtml}</div>
        <div id="results" style="display:none;">
            <button class="back-btn" onclick="showList()">← Back</button>
            <div id="results-content"></div>
        </div>
        <script>
            function showUsages(key) {
                document.getElementById('list').style.display = 'none';
                document.getElementById('results').style.display = 'block';
                document.getElementById('results-content').innerHTML = '<i>Loading...</i>';
                google.script.run.withSuccessHandler(function(html) {
                    document.getElementById('results-content').innerHTML = '<h3>Usages of ' + key + '</h3>' + html;
                }).searchActions(key);
            }
            function showList() {
                document.getElementById('list').style.display = 'block';
                document.getElementById('results').style.display = 'none';
            }
            function scrollTo(text, index) {
                google.script.run.scrollToText(text, index);
            }

            // Use event delegation for result items
            document.addEventListener('click', function(e) {
                var item = e.target.closest('.result-item');
                if (item && item.dataset.searchB64) {
                    var searchText = atob(item.dataset.searchB64);
                    searchText = decodeURIComponent(escape(searchText));
                    scrollTo(searchText, parseInt(item.dataset.index) || 1);
                }
            });
        </script>
    `;
    var html = HtmlService.createHtmlOutput(formHtml).setTitle('Actions Usage');
    DocumentApp.getUi().showSidebar(html);
}

function scrollToText(searchText, occurrenceIndex) {
    let doc = DocumentApp.getActiveDocument();
    let body = doc.getBody();

    // Escape regex special characters
    let pattern = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Find the Nth occurrence
    let found = null;
    let searchFrom = null;
    for (let i = 0; i < occurrenceIndex; i++) {
        found = body.findText(pattern, searchFrom);
        if (!found) break;
        searchFrom = found;
    }

    if (found) {
        let range = doc.newRange();
        range.addElement(found.getElement(), found.getStartOffset(), found.getEndOffsetInclusive());
        doc.setSelection(range.build());
        return true;
    }
    return false;
}

function searchActions(response) {
    let docBody = DocumentApp.getActiveDocument().getBody();
    let varsArr = [];
    let seen = new Set(); // Deduplicate results
    let occurrenceCounts = {}; // Track occurrences for scroll targeting

    let fullText = docBody.getText();
    let jsonBlocks = findJsonBlocksWithContext(fullText);

    for (let item of jsonBlocks) {
        let json = parseJson(item.block);
        if (!json) continue;
        if (!(response in json)) continue;

        let context = item.context || "";

        // Skip duplicates (same context + same block)
        let key = `${context}::${item.block}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Build search text - use context for searching
        let searchText = context.trim() || item.block.split('\n')[0];

        // Track occurrence index for this search text
        occurrenceCounts[searchText] = (occurrenceCounts[searchText] || 0) + 1;
        let occurrenceIndex = occurrenceCounts[searchText];

        // Escape for HTML data attribute (encode as base64 to avoid any escaping issues)
        let encodedSearch = Utilities.base64Encode(searchText, Utilities.Charset.UTF_8);

        varsArr.push(`<div class="result-item" data-search-b64="${encodedSearch}" data-index="${occurrenceIndex}">${context}<br><b>${item.block.replace(/\n/g, '<br>')}</b></div>`);
    }

    return varsArr.length > 0 ? varsArr.join("") : "<i>No usages found</i>";
}


function showTODO() {

    let docBody = DocumentApp.getActiveDocument().getBody();
    let todos = [];
    let paragraphs = docBody.getParagraphs();
    let roomId = "";
    let tableName = "";
    for (let i = 0; i < paragraphs.length; i++) {



        let text = paragraphs[i].getText();
        let firstChar = text[0];

        if (firstChar == "^") {
            roomId = text.substring(1);
        }

        let list = ["@", "#", "$"];
        if (list.includes(firstChar)) {
            tableName = text;
        }


        if (text.toUpperCase().match("TODO")) {
            todos.push(roomId + "" + tableName);
        }

    }
    let output = `${todos.join("<br>")}`;

    var html = HtmlService.createHtmlOutput(output)
        .setTitle('TODOs');
    DocumentApp.getUi()
        .showSidebar(html);

}

function showAnchors() {
    let docBody = DocumentApp.getActiveDocument().getBody();
    let varsArr = [];
    let paragraphs = docBody.getParagraphs();
    for (let i = 0; i < paragraphs.length; i++) {
        let text = paragraphs[i].getText();
        if (text.match(/^&.*/)) {
            varsArr.push(text);
        }
    }

    var html = HtmlService.createHtmlOutput(varsArr.join("<br>"))
        .setTitle('List of Anchors');
    DocumentApp.getUi()
        .showSidebar(html);
}

function parseJson(text) {
    // Remove [code]...[/code] blocks (contain examples, not real directives)
    text = text.replace(/\[code\].*?\[\/code\]/gmi, '');

    // Remove if statements
    text = text.replace(/(if|ifOr|else|fi){.*?}/gmi, '');

    let result = text.match(/{[\s\S]*}/);
    if (!result) return null;

    let rawJson = result[0];

    // Normalize quotes
    rawJson = rawJson
        .replace(/[“”]/gi, '"')
        .replace(/[‘’]/gi, '\'')

    // Preserve dots in flag names
    rawJson = rawJson.replace(/\.(?!\d)/g, "__dot__");
    try {
        rawJson = jsonrepair(rawJson);
    } catch (e) {
        return null; // Silently fail instead of alerting
    }
    rawJson = rawJson.replace(/__dot__/g, ".");

    try {
        return JSON.parse(rawJson);
    } catch (e) {
        return null;
    }
}


//CONVERT BLOCK
function convertI() {
    var docBody = DocumentApp.getActiveDocument().getBody();
    var paragraphs = docBody.getParagraphs();

    // look manually over <was, were, wasn't, weren't>
    let replaceArr = ["am", "Am", "me", "Me", "my", "My", "mine", "Mine", "myself", "Myself", "we", "We", "us", "Us", "our", "Our", "ours", "Ours", "ourselves", "Ourselves", "we’ve", "We’ve", "we’re", "We’re", "we’ll", "We’ll", "wasn’t", "Wasn’t"];

    for (var i = 0; i < paragraphs.length; i++) {
        var text = paragraphs[i].getText();

        //text = text.replace(/I was/gm, 'you was');


        let words = text.split(' ');
        let modifedWords = [];
        let insideQuotes = false;
        let small_I = false;
        for (let word of words) {
            if (word[0] == "“") {
                insideQuotes = true;
            }

            if (word.slice(-1) == "”") {
                insideQuotes = false;
            }

            if (!insideQuotes) {

                for (replace of replaceArr) {
                    reg = new RegExp(`^(${replace})([\.\,\!\?\:\;]?)$`); //currenly doesn't include *me* .....
                    word = word.replace(reg, '|$1|$2')
                }

                if (word == "I") {
                    if (small_I) {
                        word = "|i|";
                    } else {
                        word = "|I|";
                    }
                }

                if (word == "I’m") {
                    if (small_I) {
                        word = "|i’m|";
                    } else {
                        word = "|I’m|";
                    }
                }

                if (word == "I’ve") {
                    if (small_I) {
                        word = "|i’ve|";
                    } else {
                        word = "|I’ve|";
                    }
                }

                if (word == "I’d") {
                    if (small_I) {
                        word = "|i’d|";
                    } else {
                        word = "|I’d|";
                    }
                }

                if (word == "I’ll") {
                    if (small_I) {
                        word = "|i’ll|";
                    } else {
                        word = "|I’ll|";
                    }
                }

                //word = word.replace(/([\.\?\!])(\s?)(I)([^a-z|]|$)/gmi, '$1$2|I|$4');
                //word = word.replace(/([^a-z])(I)([^a-z|]|$)/gmi, '$1|i|$3');
                //word = word.replace(/^(I)([^a-z|])/gmi, '|I|$2');

                //word = word.replace(/([^a-z])(i’m|i|me|my|am)([^a-z|]|$)/gmi, '$1|$2|$3');
                //word = word.replace(/([^|])(myself)([^|])/gmi, '$1|$2|$3');
                //word = word.replace(/^(i|me|my|am)([^a-z|])/gmi, '|$1|$2');
            }

            if (word.match(/[\.\?\!]/)) {
                small_I = false;
            } else {
                small_I = true;
            }

            modifedWords.push(word);
        }

        paragraphs[i].replaceText(".*", modifedWords.join(' '));
    }
}

function smartQuotes() {
    var docBody = DocumentApp.getActiveDocument().getBody();
    docBody.replaceText("\'", "’");

    docBody.replaceText(":\"", ":“");
    docBody.replaceText(" \"", " “");
    docBody.replaceText("^\"", "“");

    docBody.replaceText("\" ", "” ");
    docBody.replaceText("\"}", "”}");
    docBody.replaceText("\"$", "”");
}











