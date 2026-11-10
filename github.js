import {decodeData,encodeData,validateData} from './core.js';
export function githubClient(config, fetcher = fetch) {
  if (!/^[A-Za-z0-9-]+$/.test(config.owner) || !/^[A-Za-z0-9_.-]+$/.test(config.repository) || !config.branch || config.dataPath !== 'data.json') throw Error('Проверьте настройки проекта в config.json.');
  const repo = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}`;
  const endpoint = `${repo}/contents/data.json`;
  async function request(path, token, options={}) {
    const headers = {Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'};
    if(token) headers.Authorization = `Bearer ${token}`;
    if(options.body) headers['Content-Type']='application/json';
    let response;
    try {response = await fetcher('https://api.github.com'+path, {...options, cache:'no-store', headers, signal:AbortSignal.timeout(20000)});}
    catch {throw Error('Нет ответа от GitHub. Проверьте соединение и повторите попытку.');}
    if (!response.ok) {
      const error = new Error(response.status===409 || response.status===422
        ? 'Данные в GitHub изменились. Скачайте резервную копию своих правок, затем обновите таблицу и повторите изменения.'
        : response.status===401 ? 'Ключ недействителен или истёк срок его действия.'
        : response.status===403 || response.status===429 ? 'GitHub отклонил запрос. Проверьте разрешение Contents: Read and write, срок действия ключа или повторите позже.'
        : response.status===404 ? 'Репозиторий или файл data.json не найден. Проверьте настройки проекта и доступ ключа.'
        : 'GitHub временно недоступен. Повторите попытку.');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  async function read(token) {
    const file=await request(endpoint+'?ref='+encodeURIComponent(config.branch),token);
    if(file.encoding!=='base64'||typeof file.content!=='string'||typeof file.sha!=='string') throw Error('Не удалось прочитать файл таблицы.');
    return {data:decodeData(file.content),sha:file.sha};
  }
  return {
    read,
    async login(token) {
      const user=await request('/user',token);
      if(typeof user.login!=='string'||user.login.toLowerCase()!==config.owner.toLowerCase()) throw Error('Редактировать таблицу может только владелец проекта '+config.owner+'.');
      const metadata=await request(repo,token);
      if(!metadata.permissions?.push) throw Error('У этого ключа нет доступа к записи в репозиторий.');
      const snapshot=await read(token);
      return {login:user.login,...snapshot};
    },
    async save(token,sha,data) {
      if(!token||!sha) throw Error('Сначала войдите в режим редактора и загрузите актуальную таблицу.');
      const clean=validateData(data);
      const result=await request(endpoint,token,{method:'PUT',body:JSON.stringify({message:'Обновить результаты регистрации на «Вершину»',content:encodeData(clean),sha,branch:config.branch})});
      if(!result.content?.sha) throw Error('GitHub не подтвердил сохранение. Обновите страницу и проверьте результат.');
      return {sha:result.content.sha,data:clean};
    }
  };
}
