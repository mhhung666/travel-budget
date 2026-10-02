import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buttonVariants } from '@/components/ui/button';

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

function jsxName(node: ts.JsxTagNameExpression): string {
  return node.getText();
}

function hasAttribute(attributes: ts.JsxAttributes, name: string): boolean {
  return attributes.properties.some(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === name
  );
}

function hasStaticAttributeValue(
  attributes: ts.JsxAttributes,
  name: string,
  expected: string
): boolean {
  return attributes.properties.some(
    (attribute) =>
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText() === name &&
      attribute.initializer &&
      ts.isStringLiteral(attribute.initializer) &&
      attribute.initializer.text === expected
  );
}

function hasDescendantAccessibleText(node: ts.JsxElement): boolean {
  let found = false;

  const visit = (child: ts.Node) => {
    if (found) return;

    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      const opening = ts.isJsxElement(child) ? child.openingElement : child;
      const attributes = opening.attributes;
      const className = attributes.properties.find(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText() === 'className' &&
          attribute.initializer &&
          ts.isStringLiteral(attribute.initializer)
      );

      if (
        className &&
        ts.isJsxAttribute(className) &&
        className.initializer &&
        ts.isStringLiteral(className.initializer) &&
        className.initializer.text.split(/\s+/).includes('sr-only')
      ) {
        found = true;
        return;
      }

      if (jsxName(opening.tagName) === 'AvatarImage' && hasAttribute(attributes, 'alt')) {
        found = true;
        return;
      }
    }

    ts.forEachChild(child, visit);
  };

  ts.forEachChild(node, visit);
  return found;
}

describe('interaction accessibility contracts', { timeout: 15_000 }, () => {
  it('keeps shared icon buttons at least 44px with a visible focus ring', () => {
    const classes = buttonVariants({ size: 'icon' });
    expect(classes).toContain('min-h-11');
    expect(classes).toContain('min-w-11');
    expect(classes).toContain('focus-visible:ring-2');
    expect(classes).toContain('focus-visible:ring-offset-2');
  });

  it('requires an accessible name for every shared icon button', () => {
    const root = join(process.cwd(), 'src', 'components');
    const failures: string[] = [];

    for (const file of tsxFiles(root)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );

      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node) && jsxName(node.openingElement.tagName) === 'Button') {
          const attributes = node.openingElement.attributes;
          if (
            hasStaticAttributeValue(attributes, 'size', 'icon') &&
            !hasAttribute(attributes, 'aria-label') &&
            !hasAttribute(attributes, 'aria-labelledby') &&
            !hasDescendantAccessibleText(node)
          ) {
            const position = source.getLineAndCharacterOfPosition(node.getStart(source));
            failures.push(`${relative(process.cwd(), file)}:${position.line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(source);
    }

    expect(failures, `Unnamed icon buttons:\n${failures.join('\n')}`).toEqual([]);
  });

  it('provides a global reduced-motion fallback', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation-duration: 0.01ms !important');
    expect(css).toContain('transition-duration: 0.01ms !important');
  });
});
