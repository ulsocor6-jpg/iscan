
const logs =
document.getElementById("logs");

function addLog(message){

    const time =
    new Date().toLocaleTimeString();

    logs.textContent +=
`[${time}] ${message}
`;

    logs.scrollTop =
    logs.scrollHeight;

}

document
.getElementById("restartBtn")
.addEventListener(
"click",
()=>{

    addLog(
        "Restart button pressed."
    );

});

document
.getElementById("stopBtn")
.addEventListener(
"click",
()=>{

    addLog(
        "Stop button pressed."
    );

});

document
.getElementById("recoverBtn")
.addEventListener(
"click",
()=>{

    addLog(
        "Recovery requested."
    );

});

window.addEventListener(
"load",
()=>{

    addLog(
        "Observer dashboard loaded."
    );

});
