import test from 'node:test';
import assert from 'node:assert/strict';
import {requireCollectionActions,actionPermission} from '../server/actionPermissions';
const before=[{id:'a',name:'A'}];
test('bulk catalog replacements enforce create, edit and delete independently of the client revision',()=>{
 const profile:any={role:'STOCK',modules:['inventory'],permissions:{inventory:{view:true,create:true,edit:false,delete:false}}};
 assert.doesNotThrow(()=>requireCollectionActions(profile,'inventory',before,[...before,{id:'b',name:'B'}]));
 assert.throws(()=>requireCollectionActions(profile,'inventory',before,[{id:'a',name:'Changed'}]),/editar/);
 assert.throws(()=>requireCollectionActions(profile,'inventory',before,[]),/excluir/);
 assert.equal(actionPermission({naganoProfile:profile,originalUrl:'/api/materials/a',method:'PUT',body:{}})?.action,'edit');
 assert.equal(actionPermission({naganoProfile:profile,originalUrl:'/api/materials',method:'PUT',body:{revision:'forged'}})?.action,'view');
 profile.permissions.inventory={view:true,edit:true,delete:false};
 assert.throws(()=>requireCollectionActions(profile,'inventory',before,[...before,{id:'b'}]),/criar/);
 assert.throws(()=>requireCollectionActions(profile,'inventory',before,[]),/excluir/);
});
