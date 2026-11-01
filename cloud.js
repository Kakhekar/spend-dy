// Firestore + Google sign-in. Exposes window.cloud for app.js.
// There is intentionally no delete function: entries are only ever created or updated.
import {initializeApp} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {initializeFirestore,persistentLocalCache,collection,doc,setDoc,onSnapshot} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

let db,auth,uid,unsub,started=false;

window.cloud={
  init(cfg,onItems,onUser){
    if(started)return;started=true;
    const app=initializeApp(cfg);
    auth=getAuth(app);
    db=initializeFirestore(app,{localCache:persistentLocalCache()});
    onAuthStateChanged(auth,u=>{
      uid=u?u.uid:null;
      if(unsub){unsub();unsub=null}
      onUser(u);
      if(u){
        unsub=onSnapshot(
          collection(db,"users",u.uid,"expenses"),
          s=>onItems(s.docs.map(d=>d.data())),
          err=>onUser(u,err)
        );
      }
    });
  },
  login(){return signInWithPopup(auth,new GoogleAuthProvider())},
  logout(){return signOut(auth)},
  put(it){return setDoc(doc(db,"users",uid,"expenses",it.id),it)}
};
