define(function(require, exports, module) {

	'use strict';

	// Brackets modules
	var DocumentManager = brackets.getModule("document/DocumentManager"),
		EditorManager = brackets.getModule("editor/EditorManager"),
		KeyBindingManager = brackets.getModule("command/KeyBindingManager"),
		CommandManager = brackets.getModule("command/CommandManager"),
		Menus = brackets.getModule("command/Menus"),
		ProjectContextMenu = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU),
		AppInit = brackets.getModule("utils/AppInit"),
		ProjectManager = brackets.getModule("project/ProjectManager"),
		FileSystem = brackets.getModule("filesystem/FileSystem"),
		FileUtils = brackets.getModule("file/FileUtils"),
		editorContextMenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU),
		ExtensionUtils = brackets.getModule("utils/ExtensionUtils");

	var DRAG_AND_MOVE = require("drag_and_move");
	

	var dropZone;

	var commandID_modal = "jzmstrjp.drop_includer.drop_includer_open",
		commandID_browse_root_path = "jzmstrjp.drop_includer.drop_includer_browse_root_path",
		commandID_browse_relative_path = "jzmstrjp.drop_includer.drop_includer_browse_relative_path";

	var currentDoc,
		editor;

	var cssLikeModeRegExp = /^(text\/x-less|text\/x-scss|css)$/;

	ExtensionUtils.loadStyleSheet(module, "main.less");

	CommandManager.register("Browse...(Root Path)", commandID_browse_root_path, function() { openBrowse({ root: true }); });
	CommandManager.register("Browse...(Relative Path)", commandID_browse_relative_path, openBrowse);
	CommandManager.register("Browse...(Modal Window)", commandID_modal, openDialog);

	CommandManager.register("Insert Tag(Root Path)", "insert_tag_root_path", function() { contextMenuFunc({ root: true }); });
	CommandManager.register("Insert Tag(Relative Path)", "insert_tag_relative_path", contextMenuFunc);


	function addMenu(){
		ProjectContextMenu.addMenuDivider();
		ProjectContextMenu.addMenuItem("insert_tag_root_path", "");
		ProjectContextMenu.addMenuItem("insert_tag_relative_path", "");
		editorContextMenu.addMenuDivider();
		editorContextMenu.addMenuItem(commandID_browse_root_path, "Ctrl-Shift-.");
		editorContextMenu.addMenuItem(commandID_browse_relative_path, "Ctrl-Shift-Alt-.");
		editorContextMenu.addMenuItem(commandID_modal, "Ctrl-.");
		editorContextMenu.addMenuDivider();
	}


	function contextMenuFunc(obj){
		var root = false;
		if (obj && obj.root === true) {
			root = true;
		}

		currentDoc = DocumentManager.getCurrentDocument();
		if (!currentDoc) {
			return false;
		}

		editor = EditorManager.getCurrentFullEditor();
		if (!editor) {
			return false;
		}

		var docPath = currentDoc.file._parentPath;

		var path = ProjectManager.getSelectedItem().fullPath;
		path = path.replace(/\/$/, "");
		var paths = [];
		paths.push(path);

		forEachRun(editor, docPath, paths, root);
	}


	function openBrowse(obj) {
		var root = false;
		var addTitle = "(Relative Path)";
		if (obj && obj.root === true) {
			root = true;
			addTitle = "(Root Path)";
		}

		currentDoc = DocumentManager.getCurrentDocument();
		if (!currentDoc) {
			return false;
		}

		editor = EditorManager.getCurrentFullEditor();
		if (!editor) {
			return false;
		}

		var docPath = currentDoc.file._parentPath;

		FileSystem.showOpenDialog(true, false, "Select File(s) to include. " + addTitle, null, null, function(str, paths) {
			forEachRun(editor, docPath, paths, root);
		});
	}


	function isDir(path, callback){
		FileSystem.resolve(path, function(errorString, fileSystemEntry){
			callback(fileSystemEntry._isDirectory);
		});
	}

	function forEachRun(editor, docPath, paths, root) {
		//alert(getMode(editor));
		var selections = editor.getSelections();
		var multiBGI = false;

		if (paths.length > 1) { //ファイルが1個なら複数背景の必要なし。
			multiBGI = true; //全部画像かどうか。デフォtrue。

			if (!cssLikeModeRegExp.test(getMode(editor))) {
				multiBGI = false; //modeがcss系じゃなければfalseに。
			}

			paths.forEach(function(path) {
				if (!/^(jpg|jpeg|png|gif|svg)$/.test(FileUtils.getFileExtension(path))) {
					multiBGI = false; //1つでも画像拡張子じゃなければfalseに。
				}
			});
		}


		currentDoc.batchOperation(function() {
			if (paths.length > 1 && selections.length === paths.length) {//マルチカーソルで、数が一致してたら
				var relativeFilenameArr = [];
				paths.forEach(function(elm, i, arr) {
					var relativeFilename = abspath2rel(docPath, elm, root);
					isDir(elm, function(isDir){
						relativeFilename = tagMaker(relativeFilename, root, editor, isDir);
						relativeFilenameArr.push(relativeFilename);
						if(i === arr.length - 1){//最後だったら
							one_by_one(relativeFilenameArr, selections);
						}
					});
				});
			} else if (multiBGI) {//複数背景モードだったら
				var bgiTxt = 'background-image: url(';
				paths.forEach(function(path, i, arr) {
					bgiTxt += abspath2rel(docPath, path, root);
					if (i < arr.length - 1) {
						bgiTxt += '), url(';
					}
				});
				bgiTxt += ');';
				editor.getSelections().forEach(function(sel, i) {
					editor.document.replaceRange(bgiTxt, editor.getSelections()[i].start);
				});
				editor.getSelections().forEach(function(sel, i) {
					editor.document.replaceRange("\n", editor.getSelections()[i].start);
				});
			} else {//それ以外の本来の挙動
				paths.forEach(function(elm/*  , i, arr  */) {
					var relativeFilename = abspath2rel(docPath, elm, root);
					isDir(elm, function(isDir){
						relativeFilename = tagMaker(relativeFilename, root, editor, isDir);
						doInsert({ text: relativeFilename });
						if (paths.length === 1 && relativeFilename.slice(0, 4) === "<img") {
							//1ファイルで、さらにimgなら、改行つけない。
						} else if (paths.length === 1 && relativeFilename.slice(0, 1) !== "<" && getMode(editor) === "html") {
							//1ファイルで、タグじゃなくて、htmlモードなら、改行つけない。（pdfとかは改行したくないけどcssとかは改行したいので）
						} else if (isDir){
							//ディレクトリなら改行付けない。
						} else {
							editor.getSelections().forEach(function(elme, i) {
								editor.document.replaceRange("\n", editor.getSelections()[i].start);
							});
						}
					});
				});
			}
		});
	}

	function initDropDialog() {
		dropZone = document.createElement("div");
		dropZone.id = "tagInserterDropZone";
		document.body.appendChild(dropZone);
		dropZone.innerHTML = '<div class="tagInserterWaku" id="tagInserterRoot"><p class="tagInserterP">Root Path</p></div><p id="tagInserterClose"><span>Close</span></p><div class="tagInserterWaku" id="tagInserterRel"><p class="tagInserterP">Relative Path</p></div><p class="tagInserterCenterP"><span>Drop the files.</span></p>';
		var $dropZoneChild = $("#tagInserterDropZone .tagInserterWaku");
		$dropZoneChild.on('dragenter', _handleDragEnter);
		$dropZoneChild.on('dragleave', _handleDragLeave);
		$dropZoneChild.on('drop', _handleDrop);
		document.getElementById("tagInserterClose").addEventListener("click", function() {
			dropZone.style.display = "none";
		});

		DRAG_AND_MOVE.drag_and_move(dropZone, { dragZone: ".tagInserterCenterP", resizer: true });
	}

	function openDialog() {
		if (dropZone && dropZone.style.display !== "block") {
			dropZone.style.display = "block";
		} else {
			dropZone.style.display = "none";
		}
	}


	function _handleDrop(e) {
		var root = false;
		if (e.currentTarget.id === "tagInserterRoot") {
			root = true;
		}

		currentDoc = DocumentManager.getCurrentDocument();
		if (!currentDoc) {
			return false;
		}

		editor = EditorManager.getCurrentFullEditor();
		if (!editor) {
			return false;
		}


		var files = e.originalEvent.dataTransfer.files,
			docPath = currentDoc.file._parentPath;

		if (files && files.length) {
			e.stopPropagation();
			e.preventDefault();

			brackets.app.getDroppedFiles(function(err, paths) {
				if (!err) {
					forEachRun(editor, docPath, paths, root);
				}
			});
		}
	}

	function getMode(editor) {
		var mode = editor.getModeForSelection();
		return mode;
	}

	function tagMaker(path, root, editor, dir) {
		if(dir){
			return path + "/";
		}
		var rtn;
		var mode = getMode(editor);
		var ex = FileUtils.getFileExtension(path);
		var noEx = FileUtils.getFilenameWithoutExtension(path);
		var tags = {
			js: "script",
			mp3: "audio",
			wav: "audio",
			mp4: "video"
		};
		var phpStart = '<?php ';
		var phpEnd = '?>';
		if (mode === "clike") {
			phpStart = '';
			phpEnd = '';
		}
		switch (ex) {
			case "jpg":
			case "jpeg":
			case "png":
			case "gif":
			case "svg":
				if (cssLikeModeRegExp.test(mode)) { //modeがcss系なら
					rtn = 'background-image: url(' + path + ');';
				} else {
					rtn = '<img src="' + path + '" alt="xxxxx">';
				}
				break;
			case "pdf":
				rtn = '<a href="' + path + '" target="_blank">PDF_TITLE</a>';
				break;
			case "css":
			case "scss":
			case "less":
				if(mode === "text/x-" + ex){ //scssをscssにimportするなら
					rtn = '@import "' + path + '";';
				} else if (cssLikeModeRegExp.test(mode)) { //modeがcss系なら
					rtn = '@import "' + noEx + '.css";';
				} else {
					rtn = '<link rel="stylesheet" href="' + noEx + '.css">';
				}
				break;
			case "js":
			case "mp3":
			case "wav":
			case "mp4":
				rtn = '<' + tags[ex] + ' src="' + path + '"></' + tags[ex] + '>';
				break;
			case "html":
			case "php":
				if (root) {
					rtn = phpStart + 'include $_SERVER["DOCUMENT_ROOT"]."' + path + '";' + phpEnd;
				} else {
					rtn = phpStart + 'include dirname(__FILE__)."/' + path.replace(/^\.\//, "") + '";' + phpEnd;
				}
				break;
			default:
				rtn = path;
		}
		return rtn;
	}

	function _handleDragEnter(e) {
		e.stopPropagation();
		e.preventDefault();
		e.originalEvent.dataTransfer.dropEffect = 'copy';
	}

	function _handleDragLeave(e) {
		e.stopPropagation();
		e.preventDefault();
	}

	function abspath2rel(base_path, target_path, root) {
		if (root) {
			var projectRootPath = ProjectManager.getInitialProjectPath();
			var rootPathFileName = "/" + target_path.replace(projectRootPath, "");
			return rootPathFileName;
		}

		var tmp_str = '';
		base_path = base_path.split('/');
		base_path.pop();
		target_path = target_path.split('/');
		while (base_path[0] === target_path[0]) {
			base_path.shift();
			target_path.shift();
		}
		for (var i = 0; i < base_path.length; i++) {
			tmp_str += '../';
		}
		if (tmp_str === '') {
			tmp_str = './';
		}
		return tmp_str + target_path.join('/');
	}

	/* insert */
	function one_by_one(relativeFilenameArr, selections) {
		var newSel;
		selections.forEach(function(sel, i) {
			newSel = editor.getSelections();
			editor.document.replaceRange(relativeFilenameArr[i], newSel[i].start, newSel[i].end);
		});
	}

	function doInsert(insertItem) {
		var selections = editor.getSelections();
		var edits = [];

		selections.forEach(function(sel) {
			queueEdits(edits, getEdits(sel, insertItem));
		});

		// perform edits
		selections = editor.document.doMultipleEdits(edits);

		// indent lines with selections
		selections.forEach(function(sel) {
			if (!sel.end || sel.start.line === sel.end.line) {
				currentDoc._masterEditor._codeMirror.indentLine(sel.start.line);
			}
		});
	}

	function getEdits(sel, insertItem) {
		var insertString = insertItem.text,
			replSelEnd = $.extend({}, sel.end);

		// reset selection
		var selNewStart = $.extend({}, sel.start),
			selNewEnd = $.extend({}, sel.end);

		return {
			edit: { text: insertString, start: sel.start, end: replSelEnd },
			selection: { start: selNewStart, end: selNewEnd, primary: sel.primary, isBeforeEdit: false }
		};
	}

	function queueEdits(edits, val) {
		if (val) {
			edits.push(val);
		}
	}

	AppInit.appReady(function() {
		initDropDialog();
		addMenu();
	});
});
