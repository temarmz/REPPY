import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceHistoryEntry } from '../app/browser-history.ts';
test('duplicate events do not write an unchanged browser history entry',()=>{
 const previous=globalThis.window;let writes=0;const history={state:{reppyIndex:7,reppyEntry:true},replaceState(value){writes++;this.state=value;}};
 globalThis.window={history,location:{href:'https://example.test/#/trainer'}};
 try { for(let i=0;i<200;i++)replaceHistoryEntry({reppyIndex:7,reppyEntry:true});assert.equal(writes,0);
  replaceHistoryEntry({...history.state,reppyScroll:{pageTop:100}});assert.equal(writes,1);
  replaceHistoryEntry({...history.state,reppyScroll:{pageTop:100}});assert.equal(writes,1);
  replaceHistoryEntry(history.state,'#/student');assert.equal(writes,2);
 } finally {globalThis.window=previous;}
});
