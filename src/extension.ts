// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {AST, ASTNode, ASTTransformer, Transformer} from './transformers';
const {uuid} = require('uuidv4');
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

function getRange(textEditor){
	var firstLine = textEditor.document.lineAt(0);
	var lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
	var textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
	return textRange;
}

function getSelectedNode(ast){
	const editor = vscode.window.activeTextEditor;

	const position = editor?.selection.active;

	let selectedNode = ast.findNode(position!.line, position!.character);
	console.log(selectedNode);
	return selectedNode;
}


export function activate(context: vscode.ExtensionContext) {
	const transformer = new ASTTransformer();
	var transformerStack = new Array<Transformer>();
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "smtransformer" is now active!');

	function applyLocal(action: string, params:{}): [boolean, AST] {
		const editor = vscode.window.activeTextEditor;
		const fullText = editor?.document.getText()!;
		let currentAST = new AST(fullText);
		let selectedNode = getSelectedNode(currentAST);

		if(selectedNode){
			let t = { "action": action, "params": params, "condition": "true" };
			try {
				let [dirty, newAst] = transformer.run(selectedNode, currentAST, t);
				if (dirty) {
					//guess the condition
					t.condition = transformer.getCondition(action, selectedNode, currentAST);
					transformerStack.push(t);
					editor?.edit(edit => { edit.replace(getRange(editor), newAst.toString(-1, newAst.nodeList[0]))});
				}
				return [dirty, newAst];
			} catch (error) {
				console.error(error);
				debugger;
			}
		}
		return [false, currentAST];
	};

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	vscode.commands.registerCommand('smtransformer.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from smtransformer!');
	});

	vscode.commands.registerCommand('smtransformer.openEditor', () => {
		const editor = vscode.window.activeTextEditor;
		const selectedText = editor!.document.getText(editor!.selection);
		const sessionID = uuid();
		var setting: vscode.Uri = vscode.Uri.parse("untitled:"+sessionID+".txt");
		console.log(setting);
		vscode.workspace.openTextDocument(setting).then((a: vscode.TextDocument) => {
			vscode.window.showTextDocument(a, 1, false).then(e => {
				e.edit(edit => {
					edit.insert(new vscode.Position(0, 0), selectedText);
				});
			});
		}, (error: any) => {
			console.error(error);
			debugger;
		});
	});

	vscode.commands.registerCommand('smtransformer.saveStack', () => {
		const editor = vscode.window.activeTextEditor;
		const selectedText = editor!.document.getText(editor!.selection);
		const sessionID = uuid();
		var setting: vscode.Uri = vscode.Uri.parse("untitled:"+sessionID+".stack.json");
		console.log(setting);
		vscode.workspace.openTextDocument(setting).then((a: vscode.TextDocument) => {
			vscode.window.showTextDocument(a, 1, false).then(e => {
				const tStackStr = JSON.stringify(transformerStack, null, 2);
				e.edit(edit => {
					edit.insert(new vscode.Position(0, 0), tStackStr);
				});
			});
		}, (error: any) => {
			console.error(error);
			debugger;
		});
	});

	vscode.commands.registerCommand('smtransformer.toImp', ()=>{
		let [dirty, res] = applyLocal("toImp", {});
		vscode.window.showInformationMessage('To Imp from smtransformer!');
	});
	vscode.commands.registerCommand('smtransformer.squashNegation', () => {
		let [dirty, res] = applyLocal("squashNegation", {});
		vscode.window.showInformationMessage('squashNegation from smtransformer!');
	});
}

// this method is called when your extension is deactivated
export function deactivate() {}
