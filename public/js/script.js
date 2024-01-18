const messages = document.querySelectorAll('.mess');
for(let mess of messages){
    setTimeout(() => {
        mess.remove();
    }, 4000);
}
