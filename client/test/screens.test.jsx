import React from 'react';
import {beforeAll,afterAll,afterEach,test,expect} from 'vitest';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {randomBytes} from 'node:crypto';
import {Context} from '../src/context';
import {setCsrf,post,put} from '../src/api';
import {Customers} from '../src/operations';
import {Dashboard,NewOrder,OrderList} from '../src/workflow';
import {PosOrder} from '../src/pos-order-loads';
import {AdminHistoricalOrder} from '../src/admin-historical-load-order';
import {Services,Inventory,Expenses,BusinessSettings} from '../src/management';
import {Reports} from '../src/reporting-page';
import {UserManagement,Logs} from '../src/admin-pages';
import {app} from '../../server/src/app';
import {db} from '../../server/src/db';
if(process.env.NODE_ENV!=='test'||!process.env.TEST_DATABASE_URL||process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw new Error('Disposable test database required');
const adminAgent=request.agent(app),staffAgent=request.agent(app),prefix='ui-'+randomBytes(5).toString('hex');
let user,staffUser,csrf,staffCsrf,settings,originalFetch,activeAgent;
beforeAll(async()=>{
 const password=randomBytes(18).toString('base64url');
 user=await db.user.create({data:{name:'UI Test Admin',email:prefix+'-admin@example.test',passwordHash:await bcrypt.hash(password,12),role:'ADMIN'}});
 staffUser=await db.user.create({data:{name:'UI Test Staff',email:prefix+'-staff@example.test',passwordHash:await bcrypt.hash(password,12),role:'LAUNDRY_STAFF'}});
 let login=await adminAgent.post('/api/auth/login').send({email:user.email,password});csrf=login.body.csrfToken;
 login=await staffAgent.post('/api/auth/login').send({email:staffUser.email,password});staffCsrf=login.body.csrfToken;
 setCsrf(csrf);activeAgent=adminAgent;
 settings=(await adminAgent.get('/api/settings')).body;
 originalFetch=globalThis.fetch;
 globalThis.fetch=async(path,options={})=>{
   let call=activeAgent[(options.method||'GET').toLowerCase()](path);
   for(const [k,v] of Object.entries(options.headers||{}))call=call.set(k,v);
   if(options.body)call=call.send(options.body);
   const response=await call;
   return {ok:response.status>=200&&response.status<300,status:response.status,json:async()=>response.body};
 };
});
afterEach(()=>{cleanup();activeAgent=adminAgent;setCsrf(csrf)});
afterAll(async()=>{globalThis.fetch=originalFetch;await db.$disconnect()});
const mount=(element,account=user,isAdmin=true)=>render(<MemoryRouter><Context.Provider value={{user:account,admin:isAdmin,settings,setSettings:()=>{},notify:()=>{}}}>{element}</Context.Provider></MemoryRouter>);
test('laundry staff creates a customer, increments KG service and saves a paid order',async()=>{
 activeAgent=staffAgent;setCsrf(staffCsrf);
 const ui=userEvent.setup();mount(<NewOrder/>,staffUser,false);
 await screen.findByRole('button',{name:/Wash & Fold/});
 await ui.click(screen.getByRole('button',{name:'New customer'}));
 await ui.type(screen.getByLabelText('Customer name'),prefix+' Customer');
 await ui.type(screen.getByLabelText('Phone number'),'09123456789');
 await ui.click(screen.getByRole('button',{name:'Register customer'}));
 await screen.findByText(prefix+' Customer');
 const service=screen.getByRole('button',{name:/Wash & Fold/});
 await ui.click(service);await ui.click(service);
 expect(screen.getAllByLabelText('Actual kg')).toHaveLength(1);
 expect(screen.getByLabelText('Actual kg').value).toBe('2');
 await ui.clear(screen.getByLabelText('Actual kg'));await ui.type(screen.getByLabelText('Actual kg'),'4.25');
 await ui.selectOptions(screen.getByLabelText('Payment'),'CASH');
 await ui.click(screen.getByRole('button',{name:'Save order'}));
 const dialog=await screen.findByRole('dialog');
 await waitFor(()=>expect(dialog.textContent).toMatch(/Received/i));
 expect(dialog.textContent).toMatch(/Paid/i);
 expect(screen.queryByRole('alert')).toBeNull();
});
test('admin new order remains visible as a clearly read-only function',async()=>{
 mount(<NewOrder/>);
 expect(await screen.findByText('Admin view only')).toBeTruthy();
 expect(screen.getByText(/only Laundry Staff can save an order/i)).toBeTruthy();
 expect(screen.getByRole('button',{name:'Save order'})).toBeTruthy();
});
const screens=[['Dashboard',<Dashboard/>,'Sales trend'],['Customers',<Customers/>,'Phone'],['Orders',<OrderList/>,'Services · actual → billable'],['Pickup',<OrderList mode="pickup"/>,'Pickup & claim'],['Transactions',<OrderList mode="transactions"/>,'Transactions'],['Inventory',<Inventory/>,'Stock on hand'],['Expenses',<Expenses/>,'Encoded by'],['Reports',<Reports/>,'Services sold'],['Services',<Services/>,'Wash & Fold'],['Users',<UserManagement/>,'UI Test Admin'],['Logs',<Logs/>,'View details'],['Settings',<BusinessSettings/>,'Business & turnaround']];
for(const [name,element,marker] of screens)test(name+' screen renders live API data without a runtime error',async()=>{
 mount(element);
 await waitFor(()=>expect(screen.queryByText('Loading…')).toBeNull());
 expect((await screen.findAllByText(marker)).length).toBeGreaterThan(0);
 expect(screen.queryByRole('alert')).toBeNull();
});


test('live POS keeps repeated service clicks as two editable loads', async () => {
  const ui = userEvent.setup();
  mount(<PosOrder />, staffUser, false);
  const service = await screen.findByRole('button', {name: /Wash & Fold/});
  await ui.click(service);
  await ui.click(service);
  expect(screen.getAllByLabelText('Actual kg')).toHaveLength(2);
  expect(screen.getByText(/Load 1 · Wash & Fold/)).toBeTruthy();
  expect(screen.getByText(/Load 2 · Wash & Fold/)).toBeTruthy();
  await ui.clear(screen.getAllByLabelText('Actual kg')[0]);
  await ui.type(screen.getAllByLabelText('Actual kg')[0], '5');
  await ui.clear(screen.getAllByLabelText('Actual kg')[1]);
  await ui.type(screen.getAllByLabelText('Actual kg')[1], '3');
  expect(screen.getAllByLabelText('Actual kg').map((input) => input.value)).toEqual(['5', '3']);
});

test('admin manual add allows multiple separate loads for the same service', async () => {
  const ui = userEvent.setup();
  mount(<AdminHistoricalOrder />);
  const service = await screen.findByRole('button', {name: /Wash & Fold/});
  await ui.click(service);
  expect(screen.getAllByLabelText('Actual kg')).toHaveLength(1);
  await ui.click(screen.getByRole('button', {name: 'Add another load'}));
  expect(screen.getAllByLabelText('Actual kg')).toHaveLength(2);
  expect(screen.getByText(/Load 2 · Wash & Fold/)).toBeTruthy();
});


test('admin manual entry offers Pay at Pickup for an unclaimed historical order', async () => {
  const ui = userEvent.setup();
  mount(<AdminHistoricalOrder />);
  await screen.findByRole('button', {name: /Wash & Fold/});
  expect(screen.getByRole('button', {name: /Pay at Pickup · Mark Ready/})).toBeTruthy();
  await ui.click(screen.getByRole('button', {name: /Pay at Pickup · Mark Ready/}));
  expect(screen.getByRole('button', {name: /Pay at Pickup Save as unpaid/})).toBeTruthy();
  expect(screen.getByText(/The order will be saved as unpaid/)).toBeTruthy();
});

test("stale CSRF transparently refreshes without creating duplicate orders or logging staff out", async () => {
  activeAgent=staffAgent;
  setCsrf("stale-in-memory-token",staffUser.id);
  const created=await post("/customers",{
    name:prefix+" Refreshed Token",phone:"09123456789",
  });
  expect(created.name).toBe(prefix+" Refreshed Token");
  const rows=(await staffAgent.get("/api/customers?q="+encodeURIComponent(prefix+" Refreshed Token"))).body.rows;
  expect(rows.filter(row=>row.id===created.id)).toHaveLength(1);
});

test("sitewide POST/PUT/historical saves preflight the current session after a stale token", async () => {
  activeAgent=adminAgent;
  const seen=[];
  const priorFetch=globalThis.fetch;
  globalThis.fetch=async(path,options={})=>{
    const response=await priorFetch(path,options);
    if(path.startsWith("/api/"))seen.push({path,method:options.method||"GET",status:response.status});
    return response;
  };
  try {
    setCsrf("old-admin-tab-csrf",user.id);
    const customer=await post("/customers",{
      name:prefix+" Multiple Action Customer",phone:"09123456789",
    });
    expect(customer.name).toContain("Multiple Action Customer");

    // Recreate a stale tab immediately before a second, different operation.
    setCsrf("outdated-before-edit",user.id);
    const edited=await put("/customers/"+customer.id,{
      name:prefix+" Edited Customer",phone:"09123456789",roomUnit:"305",
    });
    expect(edited.name).toContain("Edited Customer");

    setCsrf("outdated-before-historical",user.id);
    const services=(await adminAgent.get("/api/services")).body;
    const service=services.find(s=>s.name==="Wash & Fold")||services[0];
    expect(service).toBeTruthy();
    const created=await post("/orders/historical",{
      requestKey:crypto.randomUUID(),
      historicalDate:new Date().toISOString().slice(0,10),
      customerId:customer.id,
      status:"CLAIMED",
      items:[{serviceId:service.id,actualQuantity:"1",express:false}],
      payment:{method:"CASH"},
    });
    expect(created.orderNumber).toMatch(/^L-/);
    expect(seen.filter(call=>call.status===403)).toHaveLength(0);
    expect(seen.filter(call=>call.path==="/api/auth/me")).toHaveLength(3);
    expect(seen.filter(call=>call.method==="POST"||call.method==="PUT").every(call=>call.status<400)).toBe(true);
  } finally {
    globalThis.fetch=priorFetch;
  }
});

test("historical payment cards have grouped labels and concise pickup guidance",async()=>{
  mount(<AdminHistoricalOrder/>);
  await screen.findByRole('button',{name:/Wash & Fold/});
  expect(document.querySelector('.water-payment-inline')).toBeTruthy();
  expect(document.querySelector('.historical-payment-guide')).toBeTruthy();
  expect(document.querySelectorAll('.water-payment-copy').length).toBeGreaterThanOrEqual(3);
  expect(screen.getByRole('button',{name:/Pay at Pickup · Mark Ready/})).toBeTruthy();
});
