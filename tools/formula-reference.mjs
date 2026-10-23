import acorn from './vendor/acorn.cjs';

// Extract actual source expressions rather than maintain a second, drifting model document.
export function formulaReference(sources,formulas){
 const expressions=[];
 for(const {file,source}of sources){
  const ast=acorn.parse(source,{ecmaVersion:'latest',locations:true});
  const calculation=node=>['BinaryExpression','LogicalExpression','UnaryExpression','UpdateExpression','ConditionalExpression'].includes(node.type)||(node.type==='AssignmentExpression'&&node.operator!=='=')||(node.type==='CallExpression'&&(node.callee.type==='MemberExpression'&&node.callee.object.name==='Math'||node.callee.type==='Identifier'&&['clamp','smooth','configured'].includes(node.callee.name)));
  function walk(node,parents=[]){
   if(calculation(node)&&!parents.some(parent=>calculation(parent))){
    const binding=[...parents].reverse().find(parent=>parent.type==='VariableDeclarator'&&parent.id.type==='Identifier');
    const scope=parents.filter(parent=>/Function/.test(parent.type)).map(parent=>parent.id?.name).filter(Boolean);
    expressions.push({file,line:node.loc.start.line,name:[...scope,binding?.id.name].filter(Boolean).join(' / ')||node.type,expression:source.slice(node.start,node.end)});
   }
   for(const [key,value]of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value)){for(const child of value)if(child?.type)walk(child,[...parents,node]);}else if(value?.type)walk(value,[...parents,node]);}
  }
  walk(ast);
 }
 return{formulas:formulas.map(({key,expression,args,file,line})=>({key,expression,args,file,line})),expressions,sources};
}
