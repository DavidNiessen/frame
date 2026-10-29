import ts from 'typescript';

/**
 * Rewrites bundled JavaScript into the subset Lexicon's preprocessor accepts: shorthand
 * properties become `key: key` and every if/else/loop body becomes a block.
 */
export function toLexiconSandbox(code) {
  const source = ts.createSourceFile('action.js', code, ts.ScriptTarget.Latest, true);
  const { factory } = ts;
  const block = (statement) =>
    statement && !ts.isBlock(statement) ? factory.createBlock([statement], true) : statement;
  const transformer = (context) => {
    const visit = (node) => {
      node = ts.visitEachChild(node, visit, context);
      if (ts.isShorthandPropertyAssignment(node))
        return factory.createPropertyAssignment(
          node.name.text,
          factory.createIdentifier(node.name.text),
        );
      if (ts.isIfStatement(node))
        return factory.updateIfStatement(
          node,
          node.expression,
          block(node.thenStatement),
          node.elseStatement && !ts.isIfStatement(node.elseStatement)
            ? block(node.elseStatement)
            : node.elseStatement,
        );
      if (ts.isForStatement(node))
        return factory.updateForStatement(
          node,
          node.initializer,
          node.condition,
          node.incrementor,
          block(node.statement),
        );
      if (ts.isForOfStatement(node))
        return factory.updateForOfStatement(
          node,
          node.awaitModifier,
          node.initializer,
          node.expression,
          block(node.statement),
        );
      if (ts.isForInStatement(node))
        return factory.updateForInStatement(
          node,
          node.initializer,
          node.expression,
          block(node.statement),
        );
      if (ts.isWhileStatement(node))
        return factory.updateWhileStatement(node, node.expression, block(node.statement));
      return node;
    };
    return (file) => ts.visitNode(file, visit);
  };
  const [result] = ts.transform(source, [transformer]).transformed;
  return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(result);
}

/**
 * Lexicon preprocesses plugin scripts before running them and rejects syntax it cannot
 * handle: if/loop bodies without braces, do-while loops, shorthand properties, a semicolon
 * after a block, and module syntax. Returns a description of each violation.
 */
export function lexiconSandboxViolations(code) {
  const source = ts.createSourceFile('action.js', code, ts.ScriptTarget.Latest, true);
  const violations = [];
  const report = (node, message) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    violations.push(`line ${line + 1}: ${message}`);
  };
  const braced = (node, body, kind) => {
    if (body && !ts.isBlock(body)) report(node, `${kind} body without braces`);
  };
  const visit = (node) => {
    if (ts.isIfStatement(node)) {
      braced(node, node.thenStatement, 'if');
      if (node.elseStatement && !ts.isIfStatement(node.elseStatement))
        braced(node.elseStatement, node.elseStatement, 'else');
    } else if (
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isWhileStatement(node)
    )
      braced(node, node.statement, 'loop');
    else if (ts.isDoStatement(node)) report(node, 'do-while loop');
    else if (ts.isShorthandPropertyAssignment(node)) report(node, 'shorthand property');
    else if (ts.isEmptyStatement(node)) report(node, 'stray semicolon');
    else if (
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isExportAssignment(node) ||
      (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')))
    )
      report(node, 'module syntax');
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}
