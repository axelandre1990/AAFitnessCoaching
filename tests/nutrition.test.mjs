import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const root=new URL('..',import.meta.url);
const folder=existsSync(new URL('scripts/',root))?'scripts/':'';
const {macroCalories,dailyTotals}=await import(new URL(folder+'nutrition-builder.js',root));
test('theoretical energy is 4 kcal/g protein, 4 kcal/g carbs and 9 kcal/g fat',()=>{
 assert.equal(macroCalories({protein_g:200,carbs_g:250,fat_g:70}),2430);
 assert.equal(macroCalories({protein_g:12.5,carbs_g:25.75,fat_g:8.1}),225.9);
 assert.equal(macroCalories({protein_g:0,carbs_g:0,fat_g:0}),0);
 assert.equal(macroCalories({protein_g:-1,carbs_g:0,fat_g:0}),null);
});
test('daily plan totals include every meal and use food source calories independently from theoretical macros',()=>{
 const food={grams:150,per100g:{kcal:999,protein_g:20,carbs_g:30,fat_g:10,fiber_g:2}};
 const meals=Array.from({length:6},()=>({items:[]}));meals[0].items=[food];meals[5].items=[{...food,grams:50}];
 const total=dailyTotals(meals);
 assert.equal(total.protein_g,40);assert.equal(total.carbs_g,60);assert.equal(total.fat_g,20);assert.equal(total.kcal,1998);assert.equal(total.fiber_g,4);
 assert.equal(food.per100g.kcal,999);
 const updated=dailyTotals([{items:[{...food,grams:100}]}]);assert.equal(updated.kcal,999);
 assert.equal(dailyTotals([]).kcal,0);
});
