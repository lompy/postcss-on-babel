require('babel-types');
const defs = require('babel-types/lib/definitions/index');

// Dirty hack for Root to have parentPath.
defs.default('PostCSSRootContainer', {
  builder: ['root'],
  fields: {
    root: {
      validate: defs.assertNodeType('PostCSSRoot'),
      default: []
    }
  },
  visitor: ['root'],
});

defs.default('PostCSSRoot', {
  builder: ['nodes'],
  fields: {
    nodes: {
      validate: defs.chain(
        defs.assertValueType('array'),
        defs.assertEach(defs.assertNodeType('PostCSSRule', 'PostCSSAtRule'))
      ),
      default: []
    }
  },
  visitor: ['nodes'],
});

defs.default('PostCSSRule', {
  builder: ['selectors', 'nodes'],
  fields: {
    selectors: {
      validate: defs.chain(
        defs.assertValueType('array'),
        defs.assertEach(defs.assertValueType('string'))
      ),
      default: []
    },
    nodes: {
      validate: defs.chain(
        defs.assertValueType('array'),
        defs.assertEach(defs.assertNodeType('PostCSSRule', 'PostCSSAtRule', 'PostCSSDeclaration'))
      ),
      default: []
    },
  },
  visitor: ['selectors', 'nodes']
});

defs.default('PostCSSAtRule', {
  builder: ['name', 'params', 'nodes'],
  fields: {
    name: { validate: defs.assertValueType('string') },
    params: {
      validate: defs.chain(
        defs.assertValueType('array'),
        defs.assertEach(defs.assertValueType('string'))
      ),
      default: []
    },
    nodes: {
      validate: defs.chain(
        defs.assertValueType('array'),
        defs.assertEach(defs.assertNodeType('PostCSSRule', 'PostCSSAtRule', 'PostCSSDeclaration'))
      ),
      default: []
    },
  },
  visitor: ['name', 'params', 'nodes']
});

defs.default('PostCSSDeclaration', {
  builder: ['prop', 'value'],
  fields: {
    prop: {
      validate: defs.assertValueType('string'),
    },
    value: {
      validate: defs.assertValueType('string'),
    }
  },
  visitor: ['prop', 'value']
});


// Babel-types/lib/definitions creates all definitions needed for babel-types
// at initialization and does not allow add other definitions later on
// because babel-types is in circular dependency with babel-types/lib/definitions/index.
// In order for our new types to be available for visitors and to use builders we need
// to rerequire babel-types and babel-traverse after we defined our types.
// TODO: make a pull request to babel getting rid of circular dependencies.
delete require.cache[require.resolve('babel-types')];
const t = require('babel-types');
const traverse = require('babel-traverse');

// Simple SCSS example
const ast = t.postCSSRootContainer(
  t.postCSSRoot([
    t.postCSSRule(['.feedback'], [
      t.postCSSRule(['.is-fixed'], [
        t.postCSSDeclaration('position', 'fixed'),
      ]),
      t.postCSSRule(['&__button'], [
        t.postCSSRule(['&.is-fixed'], [
          t.postCSSDeclaration('transform', 'translateY(-100%)'),
        ]),
        t.postCSSDeclaration('display', 'inline-block'),
        t.postCSSDeclaration('color', '#fff'),
      ])
    ])
  ])
);

const simpleSCSSPlugin = (types) => {
  let joinSelector = (parentSelector, childSelector) => {
    if (childSelector[0] === '&') {
      return parentSelector + childSelector.slice(1);
    } else {
      return parentSelector + ' ' + childSelector;
    }
  }
  let joinSelectors = (parentSelectors, childSelectors) => {
    let result = [];
    parentSelectors.forEach((parentSelector) => {
      childSelectors.forEach((childSelector) => {
        result.push(joinSelector(parentSelector, childSelector));
      });
    });
    return result;
  };
  return {
    PostCSSRule: {
      enter(path) {
        if (types.isPostCSSRule(path.parent)) {
          let declarations = [];
          path.node.nodes.forEach((childNode, index) => {
            if (types.isPostCSSDeclaration(childNode)) {
              declarations.push(childNode);
            } else {
              path.insertBefore(
                types.postCSSRule(
                  joinSelectors(path.node.selectors, childNode.selectors),
                  childNode.nodes
                )
              );
            }
          });
          if (declarations.length > 0) {
            path.parentPath.insertBefore(
              types.postCSSRule(
                joinSelectors(path.parent.selectors, path.node.selectors),
                declarations
              )
            );
          }
          path.remove();
        }
      },
      exit(path) {
        if (path.node.nodes.length === 0) path.remove();
      }
    }
  }
};

traverse.default(
  ast,
  simpleSCSSPlugin(t),
  { init: ()=> null },
  {}
);
console.log('-------[Transformed AST]-------');
console.log(JSON.stringify(ast, null, 2));
