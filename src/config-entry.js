/* Configurable edition: keep editing one click away from the main view. */
(()=>{
 const link=document.querySelector('.configuration-link');
 if(!link)return;
 link.id='configEditorButton';link.classList.add('configuration-action');
 link.title='修改参数与文案、试算公式、查看全部公式与源码';
 document.querySelector('.top-actions').prepend(link);
 document.body.classList.add('has-config-editor');
})();
