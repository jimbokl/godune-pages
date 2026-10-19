import {feedbackTarget,feedbackKey,feedbackAnswers} from './personalization-feedback-state.mjs?v=2026101904';

export function feedbackControls({target,label,catalog,profile}){
  target=feedbackTarget(target,catalog);
  if(!target || !profile?.feedback)return null;
  const element=document.createElement('div');element.className='recommendation-feedback';element.dataset.feedbackTarget=feedbackKey(target);
  element.setAttribute('role','group');element.setAttribute('aria-label',`Оценить рекомендацию: ${label}`);
  const question=document.createElement('span');question.className='feedback-question';question.textContent='Подходит вам?';
  const actions=document.createElement('div');actions.className='feedback-actions';
  const status=document.createElement('p');status.dataset.feedbackStatus='';status.setAttribute('role','status');
  const buttons=['yes','no'].map(answer=>{
    const button=document.createElement('button');button.type='button';button.dataset.feedbackAnswer=answer;button.textContent=answer==='yes'?'В точку':'Не то';
    button.setAttribute('aria-label',`${button.textContent}: ${label}`);
    button.addEventListener('click',async()=>{
      if(busy)return;busy=true;element.setAttribute('aria-busy','true');
      try{
        const result=await profile.feedback(target,answer);
        status.textContent=result.conflict?'Профиль сбросили в другой вкладке. Оцените рекомендацию ещё раз.':result.saved?'Оценка учтена в этом браузере. Ответ можно изменить.':result.issue==='damaged'?'Профиль не удалось прочитать. Сброс доступен в блоке «Компания и время».':'Оценка осталась только в этой вкладке: браузер не разрешил сохранение.';
        render();
      }catch{status.textContent='Не удалось учесть оценку. Попробуйте ещё раз.';}
      finally{busy=false;element.removeAttribute('aria-busy');}
    });actions.append(button);return button;
  });
  let busy=false,generation;
  function render(){
    const record=profile.get().record,event=feedbackAnswers(record.events).get(feedbackKey(target));
    if(generation!==undefined && generation!==record.generation)status.textContent='';
    generation=record.generation;
    for(const button of buttons)button.setAttribute('aria-pressed',String(event?.answer===button.dataset.feedbackAnswer));
    element.dataset.feedbackGeneration=String(record.generation);
  }
  const unsubscribe=profile.subscribe(render);render();element.append(question,actions,status);
  return {element,close:unsubscribe};
}
