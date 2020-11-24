import { Node, Edge } from 'vis';
import { assert } from "./util";
import {parse, isSExpNode, SExp, SExpNode} from './s-exify';
const _ = require("lodash");

export class ASTNode{
    nodeID: number;
    token: string;
    shouldBreak: number;
    shouldInBracket: number;
    parentID: number;
    children: number[];
    transformers = [];
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;

    constructor(nodeID: number, token: string, parentID: number, children: number[]){ 
        this.nodeID = nodeID;
        this.token = token;
        this.shouldBreak = 0;
        this.shouldInBracket = 1;
        this.parentID = parentID;
        this.children = children;
        this.startLine = -1;
        this.endLine = -1;
        this.startOffset = -1;
        this.endOffset = -1;
    }

    updateRange(node: SExpNode){
        this.startLine = node.startLine;
        this.startOffset = node.startOffset;
        this.endLine = node.endLine;
        this.endOffset = node.endOffset;
    }

}

function isOpt(lst: SExp|SExpNode){
    const optList = ["+", "-", "*", "/",
                     ">", "<", ">=", "<=", "=",
                     "and", "or", "not", "=>",
                     "assert",
                     "declare-datatypes",
                     "forall", "exists", "define",
                     "select", "store"];

    if(Array.isArray(lst)){
        return false;
    }
    return optList.indexOf(lst.token)>-1;
}

export interface Transformer{
    action: string;
    condition: string;
    params: {};
}

export class ASTTransformer extends Object{
    run(node: ASTNode, ast: AST, t: Transformer): [boolean, AST]{
        if(t.action!=="runStack"){
            return this[t.action](node, ast, t.params, t.condition);
        }
        return [false, ast];
    }

    runStack(ast: AST, tStack: Transformer[]): AST{
        let new_ast = _.cloneDeep(ast);
        //loop over all transformer
        let t_index = 0;
        while(t_index < tStack.length){
            //apply the transformer to all the node if possible.
            let dirty = true;

            for(var node of new_ast.nodeList){
                [dirty, new_ast] = this.run(node, new_ast, tStack[t_index]);
                if(dirty){
                    break;
                }
            }
            //only move to the next transformer if reach fixpoint (dirty = false)
            if(!dirty){
                t_index++;
            }
        }
        return new_ast;
    }

    getCondition(action: string, node: ASTNode, ast: AST): string{
        let condition = "true";
        switch(action){
            case "move":{
                const current_token = node.token;
                condition = `node.token === ${current_token}`;
                break;
            }
            case "changeBreak":{
                const current_break = node.shouldBreak;
                const node_depth = ast.nodeDepth(node);
                condition = `ast.nodeDepth(node) === ${node_depth} && node.shouldBreak === ${current_break}`;
                break;
            }
            case "changeBracket":{
                const current_in_bracket = node.shouldInBracket ;
                const node_depth = ast.nodeDepth(node);
                condition = `ast.nodeDepth(node) === ${node_depth} && node.shouldInBracket === ${current_in_bracket}`;
                break;
            }
            case "squashNegation":{
                condition = "true";
                break;
            }
            case "replace":{
                condition = "true";
                break;
            }
            default:{
                const current_token = node.token;
                const node_depth = ast.nodeDepth(node);
                condition = `node.token === "${current_token}" && ast.nodeDepth(node) === ${node_depth}`;
                break;
            }
        }
        return condition;
    }


    squashNegation(node: ASTNode, ast: AST, params: {}, condition: string ): [boolean, AST]{
        /*
          collapse a `not` and its children N into the negation
        */
        let cloned_ast = _.cloneDeep(ast);
        let cloned_node = cloned_ast.nodeList[node.nodeID];
        let dirty = false;

        if(node.token!=="not"){
            return [false, cloned_ast]
        }

        if(eval(condition)){
            let cloned_child = cloned_ast.nodeList[cloned_node.children[0]];

            switch(cloned_child.token){
                case "not":{
                    //point new node's parent to current parent
                    let grandchild = cloned_ast.nodeList[cloned_child.children[0]];
                    grandchild.parentID = cloned_node.parentID;

                    //point parent's child to new_node
                    let current_parent = cloned_ast.nodeList[cloned_node.parentID];
                    let current_child_index = current_parent.children.indexOf(cloned_node.nodeID);
                    current_parent.children[current_child_index] = grandchild.nodeID;

                    //remove the 2 `not` nodes
                    cloned_ast.deleteNode(cloned_node);
                    cloned_ast.deleteNode(cloned_child);

                    //rebuild vis
                    cloned_ast.buildVis();

                    dirty = true;
                    break;
                }

                case "<":{
                    //flip
                    cloned_child.token = ">=";
                    //point to parent
                    cloned_child.parentID = cloned_node.parentID;
                    //point parent to grandchild
                    let current_parent = cloned_ast.nodeList[cloned_node.parentID];
                    let current_child_index = current_parent.children.indexOf(cloned_node.nodeID);
                    current_parent.children[current_child_index] = cloned_child.nodeID;

                    //remove the `not` node
                    cloned_ast.deleteNode(cloned_node);
                    //rebuild vis
                    cloned_ast.buildVis();
                    dirty = true;
                    break;
                }
                case ">":{
                    //flip
                    cloned_child.token = "<=";
                    //point to parent
                    cloned_child.parentID = cloned_node.parentID;
                    //point parent to grandchild
                    let current_parent = cloned_ast.nodeList[cloned_node.parentID];
                    let current_child_index = current_parent.children.indexOf(cloned_node.nodeID);
                    current_parent.children[current_child_index] = cloned_child.nodeID;

                    //remove the `not` node
                    cloned_ast.deleteNode(cloned_node);
                    //rebuild vis
                    cloned_ast.buildVis();
                    dirty = true;
                    break;
                }

                default:

            }

        }

        return [dirty, cloned_ast]

    }

    move(node: ASTNode, ast: AST, params: {}, condition: string ): [boolean, AST]{
        /*
          move an AST node to the left or to the right
          E.g: moveLeft("+ x y z", "z") -> "+ x z y"
         */
        const movable = ["+", "*", "=", "and", "or"];
        let cloned_ast = _.cloneDeep(ast);

        let dirty = false;
        if(eval(condition)){
            let parent = cloned_ast.nodeList[node.parentID];
            assert('direction' in params);
            assert(movable.indexOf(parent.token)!==-1, "The parent node doesnt support reordering.");//only can move stuff under some opt
            let siblings = parent.children;

            const nodePosition = siblings.indexOf(node.nodeID);

            switch(params["direction"]){
                case "l":{
                    if(nodePosition>0){
                        //ES6 magic
                        [siblings[nodePosition], siblings[nodePosition-1]] = [siblings[nodePosition-1], siblings[nodePosition]];
                        dirty = true;
                    }
                    break;
                }
                case "r":{
                    if(nodePosition<siblings.length-1){
                        //ES6 magic
                        [siblings[nodePosition], siblings[nodePosition+1]] = [siblings[nodePosition+1], siblings[nodePosition]];
                        dirty = true;
                    }
                    break;
                }
                default:
                    break;
            }
            cloned_ast.buildVis();
        }
        return [dirty, cloned_ast];
    }

    flipCmp(node: ASTNode, ast: AST, params: {}, condition: string ): [boolean, AST]{
        /*
          flip a comparison node
          E.g: flipCmp("> x y") -> "<= y x"
         */
        let cloned_ast = _.cloneDeep(ast);
        let dirty = false;
        if(eval(condition)){
            let new_node : ASTNode;
            switch(node.token){
                case "=":{
                    new_node = new ASTNode(node.nodeID, "=", node.parentID, [node.children[1], node.children[0]]);
                    dirty = true;
                    break;
                }
                case "<":{
                    new_node = new ASTNode(node.nodeID, ">=", node.parentID, [node.children[1], node.children[0]]);
                    dirty = true;
                    break;
                }
                case ">":{
                    new_node = new ASTNode(node.nodeID, "<=", node.parentID, [node.children[1], node.children[0]]);
                    dirty = true;
                    break;
                }
                case ">=":{
                    new_node = new ASTNode(node.nodeID, "<", node.parentID, [node.children[1], node.children[0]]);
                    dirty = true;
                    break;
                }
                case "<=":{
                    new_node = new ASTNode(node.nodeID, ">", node.parentID, [node.children[1], node.children[0]]);
                    dirty = true;
                    break;
                }
                default:
                    new_node = node;
            }
            cloned_ast.nodeList[node.nodeID] = new_node;
            cloned_ast.buildVis();
        }
        return [dirty, cloned_ast];
    }

    toImp(node: ASTNode, ast: AST, params: {}, condition: string ): [boolean, AST]{
        let cloned_ast = _.cloneDeep(ast);
        let cloned_node = cloned_ast.nodeList[node.nodeID];
        let dirty = false;
        if(eval(condition)){
            let parent = cloned_ast.nodeList[cloned_node.parentID];

            if(!parent || parent.token!=="or"){
                return [false, cloned_ast];
            }


            let newHead = new ASTNode(cloned_ast.nodeList.length, "not", parent.nodeID, [cloned_node.nodeID]);
            cloned_node.parentID = newHead.nodeID;
            cloned_ast.nodeList.push(newHead);

            let newTail = new ASTNode(cloned_ast.nodeList.length, "or", parent.nodeID, []);
            cloned_ast.nodeList.push(newTail);

            for(var childID of parent.children){
                if(childID !== cloned_node.nodeID){
                    cloned_ast.nodeList[childID].parentID = newTail.nodeID;
                    newTail.children.push(childID);
                }
            }

            let newParent = new ASTNode(parent.nodeID, "=>", parent.parentID, [newHead.nodeID, newTail.nodeID]);
            cloned_ast.nodeList[parent.nodeID] = newParent;

            cloned_ast.buildVis();
            dirty = true;
        }
        return [dirty, cloned_ast];
    } 

    replace(node: ASTNode, ast: AST, params: {}, condition: string ): [boolean, AST]{
        let cloned_ast = _.cloneDeep(ast);
        let dirty = false;
        let source = params["source"]
        if(eval(condition)){
            if(params["regex"]){
                source = new RegExp(params["source"])
            }


            for(var cloned_node of cloned_ast.nodeList){
                let old_token = cloned_node.token
                cloned_node.token = old_token.replace(source, params["target"]);
                if(cloned_node.token !== old_token){
                    dirty = true;
                }
            }

            if(dirty){
                cloned_ast.buildVis();
            }
        }

        return [dirty, cloned_ast];
    }
    changeBreak(node: ASTNode, ast: AST, params:{}, condition: string ): [boolean,AST]{
        let cloned_ast = _.cloneDeep(ast);
        if(eval(condition)){
            cloned_ast.nodeList[node.nodeID].shouldBreak ^= 1;
            cloned_ast.buildVis();
            return [true, cloned_ast];
        }
        return [false, cloned_ast];
    }
    changeBracket(node: ASTNode, ast: AST, params:{}, condition: string ): [boolean, AST]{
        let cloned_ast = _.cloneDeep(ast);
        if(eval(condition)){
            cloned_ast.nodeList[node.nodeID].shouldInBracket ^= 1;
            cloned_ast.buildVis();
            return [true, cloned_ast];
        }
        return [false, cloned_ast];
    }
}


export class AST {
    nodeList = new Array<ASTNode>();
    visNodes = new Array<Node>();
    visEdges = new Array<Edge>();

    null_node = new ASTNode(-100, "null-node", -100, []);
    constructor(formula: string){
        this.lstToAST(-1, parse(formula));
        this.buildVis();
    }

    nodeDepth(node: ASTNode): number{
        if (node.parentID===-1){
            return 0;
        }

        return this.nodeDepth(this.nodeList[node.parentID])+1;
    }

    deleteNode(node: ASTNode): void{
        this.nodeList[node.nodeID] = this.null_node;
    }

    findNode(line: number, character: number): ASTNode| null{
        for(var node of this.nodeList){
            if(node.startLine<=line &&
                node.endLine>=line &&
                node.startOffset<=character &&
                node.endOffset>=character)
                return node;
        }
        return null;
    }


    lstToAST(parentID: number, lst: SExp|SExpNode): number{
        const nodeID = this.nodeList.length;
        if(isSExpNode(lst)){
            const node = new ASTNode(nodeID, lst.token, parentID, []);
            node.updateRange(lst); 
            this.nodeList.push(node);
            return nodeID;
        }
        //if is an opt
        if(isOpt(lst[0])){
            let node = new ASTNode(nodeID, (lst[0] as SExpNode).token, parentID, []);
            node.updateRange(lst[0] as SExpNode);
            this.nodeList.push(node);

            for(var _i=1; _i < lst.length; _i++){

                node.children.push(this.lstToAST(nodeID, lst[_i]));
            }

            return nodeID;
        }else{
            //is a list
            let node = new ASTNode(nodeID, (lst[0] as SExpNode).token, parentID, []); 
            node.updateRange(lst[0] as SExpNode);
            // let node = new ASTNode(nodeID, "list", parentID, []);
            this.nodeList.push(node);

            for(var _i=0; _i < lst.length; _i++){
                node.children.push(this.lstToAST(nodeID, lst[_i]));
            }

            return nodeID;
        }

        //
    }

    buildVis(){
        this.visNodes = [];
        this.visEdges = [];

        for(const node of this.nodeList){
            if(node.nodeID!==-100){
                let label = node.token;

                if(node.shouldInBracket){
                    label = '(' + label + ')';
                }
                this.visNodes.push({
                    id: node.nodeID,
                    label: label + ((node.shouldBreak)?'\u21B5':''),
                    shape: "box",
                    size: 20,
                })
                for(const childID of node.children){
                    this.visEdges.push({
                        id: this.visEdges.length,
                        from: node.nodeID,
                        to: childID
                    })
                }
            }
        }
    }



    toString(selectedID: number, node: ASTNode): string{
        return this.toHTML(selectedID, node);
    }
    toHTML(selectedID: number, node: ASTNode, add_highlight = true): string{
        let result: string;
        if(node.children.length === 0){
            result = node.token
        }else{
            let children = new Array<string>();
            if(node.token !== 'list'){ children.push(node.token);  }

            for(const childID of node.children){
                children.push(this.toHTML(selectedID, this.nodeList[childID]));
            }
            if (children.length === 1 || !node.shouldInBracket){
                result = children.join(" ");
            }else{
                result = "("+children.join(" ")+")";
            }


        }

        //add highlight
        if(add_highlight && selectedID === node.nodeID){
            result = '<span class="highlighted">' + result + '</span>'
        }

        //add linebreak
        if(node.shouldBreak){
            result= '\n'+ '\t'.repeat(this.nodeDepth(node)) +  result ;
        }

        return result
    }
}


