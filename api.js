import {validateData} from './core.js';
export function passwordClient(config,fetcher=fetch){
 const base=new URL(config.apiBase||location.origin);
 if(base.protocol!=='https:'&&base.hostname!=='127.0.0.1'&&base.hostname!=='localhost')throw Error('Требуется защищённый адрес сервера.');
 async function request(path,{token,body}={}){
  const headers={};if(body)headers['Content-Type']='application/json';if(token)headers.Authorization='Bearer '+token;
  let response;try{response=await fetcher(new URL(path,base),{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw Error('Сервер не отвечает. Проверьте соединение и повторите попытку.');}
  let json;try{json=await response.json();}catch{throw Error('Не удалось прочитать ответ сервера.');}
  if(!response.ok){const error=Error(json.error||'Не удалось выполнить запрос.');error.status=response.status;throw error;}return json;
 }
 async function read(){const result=await request('/api/registration');return {data:validateData(result.data),sha:result.revision};}
 return {read,async login(password){const auth=await request('/api/editor/login',{body:{password}});if(!auth.token)throw Error('Вход не подтверждён.');return {token:auth.token,login:'Редактор',...await read()};},async save(token,revision,data){if(!token)throw Error('Войдите по паролю.');const result=await request('/api/registration',{token,body:{data:validateData(data),revision}});return {data:validateData(result.data),sha:result.revision};}};
}
