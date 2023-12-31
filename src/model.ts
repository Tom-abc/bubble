import Phaser from "phaser";
import EventEmitter from "eventemitter3";
import {EnvScene,SpriteKey,PlayerKey,AudioKey} from "./scene";
import {IterateUtils,SceneUtils} from "./utils";
import {Bar,Button,Plate} from "./ui";
import {Keyboard,ValidKeyCodes} from "./ctrl";
import e from "express";

export enum Terrain{
    EMPTY,
    TREE,
    CACTUS
}
export enum BubbleType{
    BLUE,
    RED,
    BLACK,
    GREEN,
    PURPLE
}
export enum ExplosionType{
    O,
    RED,
    BLACK
}
export enum BoxType{
    O,
    N,
    RED,
    GREEN,
    PURPLE,
    BLUE,
    BLACK,
    SILVER,
    DARK,
    GOLD,
    MAN
}
export enum SkillType{
    BLUE,
    RED,
    BLACK,
    GREEN,
    PURPLE,
    MOVE,
    RELOAD,
    NO
}
export enum PotionType{
    HEAL,
    ATTACK,
    SPEED
}

export class Board{
    scene:EnvScene;
    map:Phaser.Tilemaps.Tilemap;
    ground:Phaser.Tilemaps.TilemapLayer;
    box:Phaser.Tilemaps.TilemapLayer;
    constructor(scene:EnvScene,width:number,height:number){
        this.scene=scene;
        this.map=scene.add.tilemap(undefined,40,40,width,height);
        this.map.addTilesetImage("block",SpriteKey.BLK);
        this.map.addTilesetImage("box",SpriteKey.BOX);
        this.ground=this.map.createBlankLayer("ground","block")!;
        this.box=this.map.createBlankLayer("box","box")!;
    }
    private findTile({x,y}:Phaser.Types.Math.Vector2Like){
        const t=this.ground.getTileAtWorldXY(x||0,y||0);
        if(t==null){
            throw new Error("no tile");
        }
        return t;
    }
    reg({x,y}:Phaser.Types.Math.Vector2Like){
        const t=this.findTile({x,y});
        return this.cent(t);
    }
    unit({x,y}:Phaser.Types.Math.Vector2Like){
        const t=this.findTile({x,y});
        return new Phaser.Math.Vector2(t);
        
    }
    private getTile({x,y}:Phaser.Types.Math.Vector2Like){
        const t=this.ground.getTileAt(x||0,y||0);
        if(t==null){
            throw new Error("no tile");
        }
        return t;
    }
    cent({x,y}:Phaser.Types.Math.Vector2Like){
        const t=this.getTile({x,y});
        return new Phaser.Math.Vector2(t.getCenterX(),t.getCenterY());
    }

    check(v:Phaser.Math.Vector2){
        return v.x>=0&&v.y>=0&&v.x<this.map.width&&v.y<this.map.height;
    }
    hasBox(v:Phaser.Math.Vector2){
        return this.box.hasTileAt(v.x,v.y);
    }

}

abstract class BasePhysicsModel{
    board:Board;
    sprite:Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    constructor(board:Board,sprite:Phaser.Types.Physics.Arcade.SpriteWithDynamicBody){
        this.board=board;
        this.sprite=sprite;
        this.deactivate();
    }
    activate(){
        this.sprite.setActive(true).setVisible(true);
    }
    deactivate(){
        this.sprite.setActive(false).setVisible(false);
    }
    setPosition({x,y}:Phaser.Types.Math.Vector2Like){
        this.sprite.setPosition(x,y);
    }
    setUnit({x,y}:Phaser.Types.Math.Vector2Like){
        this.setPosition(this.board.cent({x,y}));
    }
    setVelocity({x,y}:Phaser.Types.Math.Vector2Like){
        this.sprite.setVelocity(x||0,y);
    }
}

export class BoardLike extends BasePhysicsModel{
    protected v:Phaser.Math.Vector2;
    constructor(board:Board,sprite:Phaser.Types.Physics.Arcade.SpriteWithDynamicBody){
        super(board,sprite);
        this.v=new Phaser.Math.Vector2();
    }
    setUnit({x,y}:Phaser.Types.Math.Vector2Like){
        super.setUnit({x,y});
        this.v=new Phaser.Math.Vector2(x,y);
    }
    getUnit(){
        return this.v.clone();
    }
}

export class Bubble extends BoardLike{
    type:BubbleType;
    attack:boolean;
    constructor(board:Board,type:BubbleType){
        super(board,board.scene.physics.add.sprite(0,0,SpriteKey.BUB).setDepth(1));
        this.type=type;
        this.attack=false;
    }
}

export class Explosion extends BoardLike{
    type:ExplosionType;
    constructor(board:Board,type:ExplosionType){
        super(board,board.scene.physics.add.sprite(0,0,SpriteKey.EXPL,type).setDepth(2));
        this.type=type;
        this.sprite.state=type;
    }
}

class Potion extends BoardLike{
    type:PotionType;
    constructor(board:Board,type:PotionType){
        super(board,board.scene.physics.add.sprite(0,0,SpriteKey.POTION,type).setDepth(1));
        this.type=type;
        this.sprite.state=type;
    }
}

export enum Pivot{
    W,
    S,
    E,
    N
}

class PlayerInput{
    pivot?:Pivot;
    bubble?:BubbleType;
    skill?:SkillType;
}

export class Player extends BasePhysicsModel{
    pivot:Pivot;
    walking:boolean;
    text:Phaser.GameObjects.Text;
    no:boolean;
    blink:Phaser.Time.TimerEvent;
    input:PlayerInput;
    key:PlayerKey;
    life:number;
    bluecd:number;
    redcd:number;
    greencd:number;
    speedtime:number;
    attacktime:number;
    constructor(board:Board,key:PlayerKey,txt:string){
        super(board,board.scene.physics.add.sprite(0,0,key).setOrigin(0.5,0.7));
        this.pivot=Pivot.S;
        this.walking=false;
        this.text=board.scene.add.text(0,0,txt).setDepth(2).setOrigin(0.5,0.5).setFontStyle("bold");
        this.no=false;
        this.input=new PlayerInput();
        this.key=key;
        this.life=0;
        this.bluecd=0;
        this.redcd=0;
        this.greencd=0;
        this.speedtime=0;
        this.attacktime=0;
        this.blink=board.scene.time.addEvent({
            delay:150,
            loop:true,
            paused:true,
            callback:()=>{
                this.sprite.setVisible(!this.sprite.visible);
            }
        });
    }
    getBaseVelocity(){
        return Player.getBaseVelocity(this.pivot);
    }
    static getBaseVelocity(p:Pivot){
        return Player.baseVelocity[p].clone();
    }
    private static readonly baseVelocity={
        [Pivot.W]:new Phaser.Math.Vector2(-1,0),
        [Pivot.S]:new Phaser.Math.Vector2(0,1),
        [Pivot.E]:new Phaser.Math.Vector2(1,0),
        [Pivot.N]:new Phaser.Math.Vector2(0,-1),
    };
    update(){
        this.text.setPosition(this.sprite.x,this.sprite.y+30);
    }
    cam(w?:number,h?:number){
        return this.board.scene.cameras.add(undefined,undefined,w,h).setBounds(0,0,this.board.map.widthInPixels,this.board.map.heightInPixels).startFollow(this.sprite);
    }
    start(pivot:Pivot){
        if(this.walking&&pivot===this.pivot){
            return;
        }
        this.walking=true;
        this.pivot=pivot;
        
        this.setVelocity(this.getBaseVelocity().scale(this.getSpeed()).scale(this.speedtime!=0?1.5:1));
        this.sprite.play(`${this.key}${this.pivot}`);
    }
    stop(){
        if(!this.walking){
            return;
        }
        this.walking=false;
        this.setVelocity({x:0,y:0});
        this.sprite.stop();
        this.sprite.setFrame(this.board.scene.anims.get(`${this.key}${this.pivot}`).getFrameAt(0).frame);
    }
    setNo(b:boolean){
        if(b==this.no)return;
        this.no=b;
        if(b){
            this.blink.paused=false;
        }
        else{
            this.blink.paused=true;
            this.sprite.setVisible(true);
        }
    }
    getSpeed(){
        switch(this.key){
            case PlayerKey.BOY:
                return 120;
            case PlayerKey.GIRL:
                return 90;
            case PlayerKey.BLUEBOY:
                return 140;
            case PlayerKey.BLUEGIRL:
                return 105;
            default:break;
        }
        return 0;
    }
    getNo(){
        switch(this.key){
        case PlayerKey.BOY:
            return 1000;
        case PlayerKey.GIRL:
            return 1500;
        case PlayerKey.BLUEBOY:
            return 700;
        case PlayerKey.BLUEGIRL:
            return 1200;
        }
    }
    getPosition(){
        return new Phaser.Math.Vector2(this.sprite.getTopLeft().x!+24,this.sprite.getTopLeft().y!+50);
    }
    destroy(){
        this.sprite.destroy();
        this.text.destroy();
    }
}

export abstract class Env<R extends object> extends EventEmitter<{
    done:[R,string],
    pause:[],
    resume:[],
    launch:[]
}>{
    scenes:EnvScene[];
    constructor(...scenes:EnvScene[]){
        super();
        this.scenes=scenes;
    }
    pause(){
        for(const s of this.scenes){
            SceneUtils.pause(s);
        }
        this.emit("pause");
    }
    resume(){
        for(const s of this.scenes){
            SceneUtils.resume(s);
        }
        this.emit("resume");
    }
    done(r?:R,s?:string){
        this.cleanUp();
        for(const s of this.scenes){
            SceneUtils.pause(s);
        }
        this.emit("done",r||this.quitResult(),s||"");
    }
    launch(){
        for(const s of this.scenes){
            SceneUtils.launch(s);
        }
        this.emit("launch");
        this.reset();
    }
    remove(){
        for(const s of this.scenes){
            SceneUtils.remove(s);
        }
        this.scenes=[];
    }
    abstract quitResult():R;
    abstract reset():void;
    abstract cleanUp():void;
}

export class BoxEnv extends Env<{
    score:number
}>{
    main:EnvScene;
    s:EnvScene;
    player!:Player;
    board!:Board;
    egroup!:Phaser.Physics.Arcade.Group;
    score:number;
    time:number;
    bluecd:number;
    redcd:number;
    text!:Phaser.GameObjects.Text;
    timebar!:Bar;
    pb!:Plate;
    pr!:Plate;
    //blink!:Phaser.Time.TimerEvent;
    keys!:Record<ValidKeyCodes,Phaser.Input.Keyboard.Key>;
    gens:number;
    constructor(main:EnvScene,s:EnvScene,pkey:PlayerKey){
        super(main,s);
        this.main=main;
        this.s=s;
        this.score=0;
        this.time=0;
        this.bluecd=0;
        this.redcd=0;
        this.gens=0;

        this.s.myEvents.on("create",()=>{

            this.s.add.tileSprite(0,0,200,600,SpriteKey.GRASS,0).setOrigin(0,0);
            this.text=this.s.add.text(100,100,"0").setOrigin(0.5,0.5).setColor("#fff000").setFontSize(20);
            this.timebar=new Bar(this.s);
            this.timebar.setMax(180000);
            this.timebar.setColor(0xffffff);
            this.timebar.setPosition(50,200);
            this.timebar.setLineWidth(2);
            this.timebar.setSize(100,20);
            this.timebar.activate();
            
            this.pb=new Plate(this.s);
            this.pb.setColor(0x5050ff);
            this.pb.setPosition(50,400);
            this.pb.setSize(25);
            this.pb.setMax(100);
            this.pb.activate();

            this.pr=new Plate(this.s);
            this.pr.setColor(0xff0000);
            this.pr.setPosition(150,400);
            this.pr.setSize(25);
            this.pr.setMax(100);
            this.pr.activate();
            
            
            const b=new Button(this.s,()=>{
                this.pause();
            });
            b.defaults();
            b.setText("Pause");
            b.setPosition(50,300);
            b.setSize(100,50);
            b.activate();
            
            this.s.cameras.main.setViewport(600,0,200,600);
        });

        this.main.myEvents.on("create",()=>{
            
            const w=20,h=20;
            this.board=new Board(this.main,w,h);
            this.egroup=this.main.physics.add.group();
            this.main.sound.play(AudioKey.LOON,{loop:true});
            

            this.main.scale.resize(800,600);


            this.board.ground.setCollisionBetween(1,100);
            this.board.box.setCollisionBetween(0,100);

            this.board.ground.fill(Terrain.EMPTY,0,0,w,h);
            this.board.ground.fill(Terrain.TREE,0,0,w,1);
            this.board.ground.fill(Terrain.TREE,0,h-1,w,1);
            this.board.ground.fill(Terrain.TREE,0,0,1,h);
            this.board.ground.fill(Terrain.TREE,w-1,0,1,h);

            for(let i=0;i<20;i++){
                const x=Math.floor(Math.random()*(w-2)+1);
                const y=Math.floor(Math.random()*(h-2)+1);
                if(x==10&&y==10){
                    i--;
                    continue;
                }
                this.board.ground.putTileAt(Terrain.CACTUS,x,y);
            }
            this.main.physics.world.on("worldstep",(d:number)=>{
                if(this.player.input.pivot!==undefined){
                    this.player.start(this.player.input.pivot);
                    //this.player.input.pivot=undefined;
                }
                else{
                    this.player.stop();
                }
                if(this.player.input.bubble!==undefined){
                    let ok=false;
                    switch(this.player.input.bubble){
                    case BubbleType.BLUE:
                        if(this.bluecd<100)break;
                        ok=true;
                        this.bluecd=0;
                        break;
                    case BubbleType.RED:
                        if(this.redcd<100)break;
                        ok=true;
                        this.redcd=0;
                        break;
                    default:break;
                    }
                    if(ok){
                        const b=new Bubble(this.board,this.player.input.bubble);
                        b.setUnit(this.board.unit(this.player.getPosition()));
                        this.start(b,2000);
                    }
                    this.player.input.bubble=undefined;
                }
                if(this.player.input.skill!==undefined){
                    this.player.input.skill=undefined;
                }
            });

            this.keys=Keyboard.getKeyboardKeys(this.main);
            this.keys.Q.on("down",()=>{
                this.player.input.bubble=BubbleType.BLUE;
            });
            this.keys.E.on("down",()=>{
                this.player.input.bubble=BubbleType.RED;
            });
            /*this.keys.A.on("down",()=>{
                this.player.pivot=Pivot.W;
            });
            this.keys.D.on("down",()=>{
                this.player.pivot=Pivot.E;
            });
            this.keys.W.on("down",()=>{
                this.player.pivot=Pivot.N;
            });
            this.keys.S.on("down",()=>{
                this.player.pivot=Pivot.S;
            });*/

            this.player=new Player(this.board,pkey,"Player");
            this.player.setUnit({x:10,y:10});
            this.player.activate();
            this.player.sprite.body.setSize(10,10,false);
            this.player.sprite.body.setOffset(19,45);


            this.main.physics.add.collider(this.player.sprite,this.board.box);
            this.main.physics.add.collider(this.player.sprite,this.board.ground);

            this.gens=3;
            this.gen();

            this.main.cameras.addExisting(this.player.cam(600,600),true);
        });
        this.main.myEvents.on("update",(t,delta)=>{
            this.time=Math.max(0,this.time-delta);
            this.timebar.setCur(this.time);
            this.bluecd=Math.min(100,this.bluecd+delta*0.05);
            this.pb.setCur(this.bluecd);
            this.redcd=Math.min(100,this.redcd+delta*0.04);
            this.pr.setCur(this.redcd);

            if(this.timebar.cur==0){
                this.done({score:this.score},`Score: ${this.score}`);
                return;
            }
            this.player.update();
            if(this.keys.A.isDown){
                this.player.input.pivot=Pivot.W;
            }
            else if(this.keys.D.isDown){
                this.player.input.pivot=Pivot.E;
            }
            else if(this.keys.W.isDown){
                this.player.input.pivot=Pivot.N;
            }
            else if(this.keys.S.isDown){
                this.player.input.pivot=Pivot.S;
            }
            else{
                this.player.input.pivot=undefined;
            }
            

            this.main.physics.overlap(this.player.sprite,this.egroup,(a,b)=>{
                if(this.player.no)return;
                a=a as Phaser.Types.Physics.Arcade.GameObjectWithBody;
                b=b as Phaser.Types.Physics.Arcade.GameObjectWithBody;
                this.player.setNo(true);
                this.main.time.addEvent({
                    delay:1000,
                    callback:()=>{
                        this.player.setNo(false);
                    }
                });
                switch(b.state){
                case ExplosionType.O:
                    this.upd(-1);
                    break;
                case ExplosionType.RED:
                    this.upd(-2);
                    break;
                case ExplosionType.BLACK:
                    this.upd(-3);
                    break;
                default:break;
                }
            });
            const bo=this.board.box;
            this.main.physics.overlap(bo,this.egroup,(b,a)=>{
                a=a as Phaser.Tilemaps.Tile;
                b=b as Phaser.Types.Physics.Arcade.GameObjectWithBody;
                
                switch(a.index){
                case BoxType.O:
                    bo.putTileAt(-1,a.x,a.y);
                    this.upd(1);
                    break;
                case BoxType.N:
                    if(b.state===ExplosionType.O){
                        bo.putTileAt(BoxType.O,a.x,a.y);
                    }
                    else{
                        bo.putTileAt(-1,a.x,a.y);
                        this.upd(1);
                    }
                    break;
                case BoxType.SILVER:
                    if(b.state===ExplosionType.O){
                        bo.putTileAt(BoxType.N,a.x,a.y);
                    }
                    else if(b.state===ExplosionType.RED){
                        bo.putTileAt(BoxType.O,a.x,a.y);
                    }
                    else{
                        bo.putTileAt(-1,a.x,a.y);
                        this.upd(1);
                    }
                    break;
                case BoxType.BLUE:
                    bo.putTileAt(-1,a.x,a.y);
                    this.upd(1);
                    const x=new Bubble(this.board,BubbleType.BLUE);
                    x.setUnit(a);
                    this.start(x,2000);
                    break;
                case BoxType.RED:
                    bo.putTileAt(-1,a.x,a.y);
                    this.upd(1);
                    const y=new Bubble(this.board,BubbleType.RED);
                    y.setUnit(a);
                    this.start(y,2000);
                    break;
                case BoxType.BLACK:
                    bo.putTileAt(-1,a.x,a.y);
                    this.upd(1);
                    const z=new Bubble(this.board,BubbleType.BLACK);
                    z.setUnit(a);
                    this.start(z,2000);
                    break;
                case BoxType.GREEN:
                    bo.putTileAt(-1,a.x,a.y);
                    this.upd(1);
                    const w=new Bubble(this.board,BubbleType.GREEN);
                    w.setUnit(a);
                    this.start(w,2000);
                    break;
                case BoxType.PURPLE:
                    bo.putTileAt(-1,a.x,a.y);
                    this.upd(1);
                    const v=new Bubble(this.board,BubbleType.PURPLE);
                    v.setUnit(a);
                    this.start(v,2000);
                    break;
                case BoxType.DARK:
                    if(b.state===ExplosionType.RED||b.state===ExplosionType.BLACK){
                        bo.putTileAt(-1,a.x,a.y);
                        this.upd(1);
                    }
                    break;
                case BoxType.GOLD:
                    bo.putTileAt(-1,a.x,a.y);
                    this.upd(2);
                    break;
                default:break;
                }
            });
            //this.main.physics.world.disable(this.egroup);
            this.egroup.clear();
        });
        this.launch();
    }
    quitResult(){
        return {score:this.score};
    }
    upd(v:number){
        this.text.setText((this.score+=v).toString());
    }
    start(b:Bubble,s:number){
        b.activate();
        b.sprite.play(`${SpriteKey.BUB}${b.type}`);
        this.board.scene.time.addEvent({
            delay:s,
            callback:()=>{
                this.pop(b);
                b.sprite.destroy();
            }
        });
    }
    pop(b:Bubble){
        this.main.sound.play(AudioKey.EXPLO);
        switch(b.type){
        case BubbleType.BLUE:
            for(let i=0;i<=2;i++){
                IterateUtils.iterateX(i,v=>{
                    const x=b.getUnit().add(v);
                    if(!this.board.check(x))return;
                    const l=new Explosion(this.board,ExplosionType.O);
                    this.egroup.add(l.sprite);
                    l.setUnit(x);
                    l.activate();
                    this.main.time.addEvent({
                        delay:500,
                        callback:()=>{
                            l.sprite.destroy();
                        }
                    });
                });
            }
            break;
        case BubbleType.RED:
            for(let i=0;i<=1;i++){
                IterateUtils.iterateX(i,v=>{
                    const x=b.getUnit().add(v);
                    if(!this.board.check(x))return;
                    const l=new Explosion(this.board,ExplosionType.RED);
                    this.egroup.add(l.sprite);
                    l.setUnit(x);
                    l.activate();
                    this.main.time.addEvent({
                        delay:500,
                        callback:()=>{
                            l.sprite.destroy();
                        }
                    });
                });
            }
            IterateUtils.iterateH(1,1,v=>{
                const x=b.getUnit().add(v);
                if(!this.board.check(x))return;
                const l=new Explosion(this.board,ExplosionType.O);
                this.egroup.add(l.sprite);
                l.setUnit(x);
                l.activate();
                this.main.time.addEvent({
                    delay:500,
                    callback:()=>{
                        l.sprite.destroy();
                    }
                });
            });
            break;
        case BubbleType.GREEN:
            for(let i=0;i<this.board.map.width;i++){
                const l=new Explosion(this.board,ExplosionType.O);
                this.egroup.add(l.sprite);
                l.setUnit(new Phaser.Math.Vector2(i,b.getUnit().y));
                l.activate();
                this.main.time.addEvent({
                    delay:500,
                    callback:()=>{
                        l.sprite.destroy();
                    }
                });
            }
            for(let j=0;j<this.board.map.height;j++){
                if(j==b.getUnit().y){
                    continue;
                }
                const l=new Explosion(this.board,ExplosionType.O);
                this.egroup.add(l.sprite);
                l.setUnit(new Phaser.Math.Vector2(b.getUnit().x,j));
                l.activate();
                this.main.time.addEvent({
                    delay:500,
                    callback:()=>{
                        l.sprite.destroy();
                    }
                });
            }
            break;
        case BubbleType.BLACK:
            IterateUtils.iterateX(1,v=>{
                const x=b.getUnit().add(v);
                if(!this.board.check(x))return;
                const l=new Explosion(this.board,ExplosionType.BLACK);
                this.egroup.add(l.sprite);
                l.setUnit(x);
                l.activate();
                this.main.time.addEvent({
                    delay:500,
                    callback:()=>{
                        l.sprite.destroy();
                    }
                });
            });
            break;
        case BubbleType.PURPLE:
            IterateUtils.iterateO(1,1,v=>{
                const x=b.getUnit().add(v);
                if(!this.board.check(x))return;
                if(!this.board.hasBox(x))return;
                const l=new Explosion(this.board,ExplosionType.RED);
                this.egroup.add(l.sprite);
                l.setUnit(x);
                l.activate();
                this.main.time.addEvent({
                    delay:500,
                    callback:()=>{
                        l.sprite.destroy();
                    }
                });
            });
            break;
        default:break;
        }
    }
    /*setNo(p:Player,b:boolean){
        if(b==p.no)return;
        p.no=b;
        if(b){
            p.blink.paused=false;
        }
        else{
            p.blink.paused=true;
            p.sprite.setVisible(true);
        }
    }*/
    gen(){
        this.gens++;
        for(let i=0;i<this.board.map.width;i++){
            for(let j=0;j<this.board.map.height;j++){
                if(this.player.getPosition().distance(this.board.cent({x:i,y:j}))<2*this.board.map.tileWidth)continue;
                const t=this.board.ground.getTileAt(i,j,true).index;
                if(t!=Terrain.EMPTY)continue;
                if(this.board.hasBox(new Phaser.Math.Vector2(i,j)))continue;
                if(Math.random()<4/(this.gens+10))continue;
                const l=[Math.max(0,0.5*(this.gens-3)),Math.max(0,0.1*(this.gens-2)),Math.max(0,0.3*(this.gens-2)),0.05*(this.gens-1),0.05*(this.gens-1),0.1*this.gens,0.1*this.gens,this.gens,Math.sqrt(this.gens)];
                const tp=[BoxType.SILVER,BoxType.GOLD,BoxType.DARK,BoxType.PURPLE,BoxType.GREEN,BoxType.BLACK,BoxType.BLUE,BoxType.N,BoxType.O];
                const res=Math.random()*l.reduce((p,a)=>p+a);
                let s=0;
                for(let k=0;k<9;k++){
                    s+=l[k];
                    if(res<s){
                        this.board.box.putTileAt(tp[k],i,j,true);
                        break;
                    }

                }
            }
        }
    }
    reset(){
        this.score=0;
        this.time=180000;
        this.bluecd=0;
        this.redcd=0;
        this.gens=0;
    }
    cleanUp(){
        this.main.sound.stopAll();
    }
}

export class PVPEnv extends Env<{
    winner:string
}>{
    
    
    main:EnvScene;
    s:EnvScene;
    player1!:Player;
    player2!:Player;
    board!:Board;
    egroup!:Phaser.Physics.Arcade.Group;
    pgroup!:Phaser.Physics.Arcade.Group;
    ptngroup!:Phaser.Physics.Arcade.Group;
    //score:number;
    time:number;
    
    text!:Phaser.GameObjects.Text;
    timebar!:Bar;
    hp!:Bar;
    hp2!:Bar;
    pb!:Plate;
    pr!:Plate;
    pb2!:Plate;
    pr2!:Plate;
    //blink!:Phaser.Time.TimerEvent;
    keys!:Record<ValidKeyCodes,Phaser.Input.Keyboard.Key>;
    gens:number;
    players:Map<number,Player>;
    newi:number;
    norm:boolean;
    constructor(main:EnvScene,s:EnvScene,pk1:PlayerKey,pk2:PlayerKey){
        super(main,s);
        this.main=main;
        this.s=s;
        //this.score=0;
        this.time=0;
        /*this.bluecd=0;
        this.redcd=0;
        this.bluecd2=0;
        this.redcd2=0;*/
        this.gens=0;
        this.players=new Map();
        this.newi=0;
        this.norm=true;

        this.s.myEvents.on("create",()=>{

            this.s.add.tileSprite(0,0,200,600,SpriteKey.GRASS,0).setOrigin(0,0);
            this.s.add.tileSprite(200,0,200,600,SpriteKey.GRASS,2).setOrigin(0,0);
            //this.text=this.s.add.text(100,100,"0").setOrigin(0.5,0.5).setColor("#fff000").setFontSize(20);
            this.timebar=new Bar(this.s);
            this.timebar.setMax(120000);
            this.timebar.setColor(0xffffff);
            this.timebar.setPosition(50,200);
            this.timebar.setLineWidth(2);
            this.timebar.setSize(300,20);
            this.timebar.activate();

            this.hp=new Bar(this.s);
            this.hp.setMax(5);
            this.hp.setCur(5);
            this.hp.setColor(0x00ff00);
            this.hp.setPosition(50,250);
            this.hp.setLineWidth(2);
            this.hp.setSize(100,20);
            this.hp.activate();

            this.hp2=new Bar(this.s);
            this.hp2.setMax(5);
            this.hp2.setCur(5);
            this.hp2.setColor(0x00ff00);
            this.hp2.setPosition(250,250);
            this.hp2.setLineWidth(2);
            this.hp2.setSize(100,20);
            this.hp2.activate();
            
            this.pb=new Plate(this.s);
            this.pb.setColor(0x5050ff);
            this.pb.setPosition(50,400);
            this.pb.setSize(25);
            this.pb.setMax(100);
            this.pb.activate();

            this.pr=new Plate(this.s);
            this.pr.setColor(0xff0000);
            this.pr.setPosition(150,400);
            this.pr.setSize(25);
            this.pr.setMax(100);
            this.pr.activate();
            
            this.pb2=new Plate(this.s);
            this.pb2.setColor(0x5050ff);
            this.pb2.setPosition(250,400);
            this.pb2.setSize(25);
            this.pb2.setMax(100);
            this.pb2.activate();
            
            this.pr2=new Plate(this.s);
            this.pr2.setColor(0xff0000);
            this.pr2.setPosition(350,400);
            this.pr2.setSize(25);
            this.pr2.setMax(100);
            this.pr2.activate();
            
            const b=new Button(this.s,()=>{
                this.pause();
            });
            b.defaults();
            b.setText("Pause");
            b.setPosition(100,50);
            b.setSize(200,100);
            b.activate();
            
            this.s.cameras.main.setViewport(500,0,400,600);
        });

        this.main.myEvents.on("create",()=>{
            
            const w=20,h=20;
            this.board=new Board(this.main,w,h);
            this.egroup=this.main.physics.add.group();
            this.pgroup=this.main.physics.add.group();
            this.ptngroup=this.main.physics.add.group();
            this.main.sound.play(AudioKey.LOON,{loop:true});

            this.main.time.addEvent({
                delay:10000,
                callback:()=>{
                    this.land();
                },
                loop:true
            });
            this.main.time.addEvent({
                delay:30000,
                callback:()=>{
                    this.gen();
                },
                loop:true
            });
            this.main.time.addEvent({
                delay:5000,
                loop:true,
                callback:()=>{
                    if(Math.random()>0.5)this.landPotion(PotionType.SPEED);
                    else this.landPotion(PotionType.ATTACK);
                }
            });
            

            this.main.scale.resize(1400,600);


            this.board.ground.setCollisionBetween(1,100);
            this.board.box.setCollisionBetween(0,100);

            this.board.ground.fill(Terrain.EMPTY,0,0,w,h);
            this.board.ground.fill(Terrain.TREE,0,0,w,1);
            this.board.ground.fill(Terrain.TREE,0,h-1,w,1);
            this.board.ground.fill(Terrain.TREE,0,0,1,h);
            this.board.ground.fill(Terrain.TREE,w-1,0,1,h);

            for(let i=0;i<20;i++){
                const x=Math.floor(Math.random()*(w-2)+1);
                const y=Math.floor(Math.random()*(h-2)+1);
                if((x==7&&y==7)||(x==14&&y==14)){
                    i--;
                    continue;
                }
                this.board.ground.putTileAt(Terrain.CACTUS,x,y);
            }
            this.main.physics.world.on("worldstep",(d:number)=>{
                for(const player of this.players.values()){
                    if(player.input.pivot!==undefined){
                        player.start(player.input.pivot);
                        //this.player.input.pivot=undefined;
                    }
                    else{
                        player.stop();
                    }
                    if(player.input.bubble!==undefined){
                        let ok=false;
                        switch(player.input.bubble){
                        case BubbleType.BLUE:
                            if(player.bluecd<100)break;
                            ok=true;
                            player.bluecd=0;
                            break;
                        case BubbleType.RED:
                            if(player.redcd<100)break;
                            ok=true;
                            player.redcd=0;
                            break;
                        case BubbleType.GREEN:
                            if(player.greencd<100)break;
                            ok=true;
                            player.greencd=0;
                            break;
                        default:break;
                        }
                        if(ok){
                            const b=new Bubble(this.board,player.input.bubble);
                            if(player.attacktime!=0)b.attack=true;
                            b.setUnit(this.board.unit(player.getPosition()));
                            this.start(b,2000);
                        }
                        player.input.bubble=undefined;
                    }
                    if(player.input.skill!==undefined){
                        player.input.skill=undefined;
                    }

                }
                
            });

            this.keys=Keyboard.getKeyboardKeys(this.main);
            this.keys.Q.on("down",()=>{
                this.player1.input.bubble=BubbleType.BLUE;
            });
            this.keys.E.on("down",()=>{
                this.player1.input.bubble=BubbleType.RED;
            });
            this.keys.N.on("down",()=>{
                this.player2.input.bubble=BubbleType.BLUE;
            });
            this.keys.M.on("down",()=>{
                this.player2.input.bubble=BubbleType.RED;
            });
            

            this.player1=new Player(this.board,pk1,"Player1");
            this.player1.setUnit({x:7,y:7});
            this.player1.activate();
            this.player1.sprite.body.setSize(10,10,false);
            this.player1.sprite.body.setOffset(19,45);

            this.player2=new Player(this.board,pk2,"Player2");
            this.player2.setUnit({x:14,y:14});
            this.player2.activate();
            this.player2.sprite.body.setSize(10,10,false);
            this.player2.sprite.body.setOffset(19,45);

            this.player1.life=this.player2.life=5;

            this.record(this.player1);
            this.record(this.player2);

            this.pgroup.add(this.player1.sprite);
            this.pgroup.add(this.player2.sprite);

            this.main.physics.add.collider(this.pgroup,this.board.box);
            this.main.physics.add.collider(this.pgroup,this.board.ground);

            this.gen();

            this.main.cameras.remove(this.main.cameras.main);
            this.player1.cam(500,600).setViewport(0,0,500,600);
            this.player2.cam(500,600).setViewport(900,0,500,600);
        });
        this.main.myEvents.on("update",(t,delta)=>{
            this.time=Math.max(0,this.time-delta);
            this.timebar.setCur(this.time);

            if(this.norm&&this.time==0){
                this.norm=false;
                this.main.time.addEvent({
                    delay:5000,
                    loop:true,
                    callback:()=>{
                        this.land();
                    }
                });
            }

            
            for(const player of this.players.values()){
                player.bluecd=Math.min(100,player.bluecd+delta*0.05);
                player.redcd=Math.min(100,player.redcd+delta*0.04);
                player.greencd=Math.min(100,player.greencd+delta*0.02);
                player.speedtime=Math.max(0,player.speedtime-delta);
                player.attacktime=Math.max(0,player.attacktime-delta);

                if(player===this.player1){
                    this.pb.setCur(player.bluecd);
                    this.pr.setCur(player.redcd);
                }
                else if(player===this.player2){
                    this.pb2.setCur(player.bluecd);
                    this.pr2.setCur(player.redcd);
                }

                player.update();
                
            }
            
            if(this.keys.A.isDown){
                this.player1.input.pivot=Pivot.W;
            }
            else if(this.keys.D.isDown){
                this.player1.input.pivot=Pivot.E;
            }
            else if(this.keys.W.isDown){
                this.player1.input.pivot=Pivot.N;
            }
            else if(this.keys.S.isDown){
                this.player1.input.pivot=Pivot.S;
            }
            else{
                this.player1.input.pivot=undefined;
            }

            if(this.keys.UP.isDown){
                this.player2.input.pivot=Pivot.N;
            }
            else if(this.keys.DOWN.isDown){
                this.player2.input.pivot=Pivot.S;
            }
            else if(this.keys.LEFT.isDown){
                this.player2.input.pivot=Pivot.W;
            }
            else if(this.keys.RIGHT.isDown){
                this.player2.input.pivot=Pivot.E;
            }
            else{
                this.player2.input.pivot=undefined;
            }
            
            for(const player of this.players.values()){
                if(player===this.player1||player===this.player2)continue;
                if(Math.random()<0.04){
                    let r:number;
                    do{
                        r=Math.floor(Math.random()*4);
                    }while(r==player.pivot);
                    player.input.pivot=r;
                }
                if(player.bluecd==100){
                    player.input.bubble=BubbleType.BLUE;
                }
                else if(player.redcd==100){
                    player.input.bubble=BubbleType.RED;
                }
                else if(player.greencd==100){
                    player.input.bubble=BubbleType.GREEN;
                }
            }

            this.main.physics.overlap(this.pgroup,this.egroup,(a,b)=>{
                
                a=a as Phaser.Types.Physics.Arcade.GameObjectWithBody;
                b=b as Phaser.Types.Physics.Arcade.GameObjectWithBody;
                const player=this.getPlayer(a);
                if(player.no)return;
                player.setNo(true);
                this.main.time.addEvent({
                    delay:1000,
                    callback:()=>{
                        player.setNo(false);
                    }
                });
                switch(b.state){
                case ExplosionType.O:
                    player.life--;
                    break;
                case ExplosionType.RED:
                    player.life-=2;
                    break;
                case ExplosionType.BLACK:
                    player.life-=3;
                    break;
                default:break;
                }
                if(player===this.player1){
                    this.hp.setCur(player.life);
                }
                else if(player===this.player2){
                    this.hp2.setCur(player.life);
                }
                if(player.life<=0){
                    this.players.delete(a.state as number);
                    player.destroy();
                    if(player===this.player1){
                        this.done({winner:"Player2"},"Player2 wins!");
                    }
                    else if(player===this.player2){
                        this.done({winner:"Player1"},"Player1 wins!");
                    }
                }
            });
            const bo=this.board.box;
            this.main.physics.overlap(bo,this.egroup,(b,a)=>{
                a=a as Phaser.Tilemaps.Tile;
                b=b as Phaser.Types.Physics.Arcade.GameObjectWithBody;
                
                switch(a.index){
                case BoxType.O:
                    bo.putTileAt(-1,a.x,a.y);
                    //this.upd(1);
                    break;
                case BoxType.N:
                    if(b.state===ExplosionType.O){
                        bo.putTileAt(BoxType.O,a.x,a.y);
                    }
                    else{
                        bo.putTileAt(-1,a.x,a.y);
                        //this.upd(1);
                    }
                    break;
                case BoxType.SILVER:
                    if(b.state===ExplosionType.O){
                        bo.putTileAt(BoxType.N,a.x,a.y);
                    }
                    else if(b.state===ExplosionType.RED){
                        bo.putTileAt(BoxType.O,a.x,a.y);
                    }
                    else{
                        bo.putTileAt(-1,a.x,a.y);
                        //this.upd(1);
                    }
                    break;
                case BoxType.BLUE:
                    bo.putTileAt(-1,a.x,a.y);
                    //this.upd(1);
                    const x=new Bubble(this.board,BubbleType.BLUE);
                    x.setUnit(a);
                    this.start(x,2000);
                    break;
                case BoxType.RED:
                    bo.putTileAt(-1,a.x,a.y);
                    //this.upd(1);
                    const y=new Bubble(this.board,BubbleType.RED);
                    y.setUnit(a);
                    this.start(y,2000);
                    break;
                case BoxType.BLACK:
                    bo.putTileAt(-1,a.x,a.y);
                    //this.upd(1);
                    const z=new Bubble(this.board,BubbleType.BLACK);
                    z.setUnit(a);
                    this.start(z,2000);
                    break;
                case BoxType.GREEN:
                    bo.putTileAt(-1,a.x,a.y);
                    //this.upd(1);
                    const w=new Bubble(this.board,BubbleType.GREEN);
                    w.setUnit(a);
                    this.start(w,2000);
                    break;
                case BoxType.PURPLE:
                    bo.putTileAt(-1,a.x,a.y);
                    //this.upd(1);
                    const v=new Bubble(this.board,BubbleType.PURPLE);
                    v.setUnit(a);
                    this.start(v,2000);
                    break;
                case BoxType.DARK:
                    if(b.state===ExplosionType.RED||b.state===ExplosionType.BLACK){
                        bo.putTileAt(-1,a.x,a.y);
                        //this.upd(1);
                    }
                    break;
                case BoxType.GOLD:
                    bo.putTileAt(-1,a.x,a.y);
                    //this.upd(2);
                    break;
                case BoxType.MAN:
                    bo.putTileAt(-1,a.x,a.y);
                    const p=new Player(this.board,PlayerKey.BOY,"Bot");
                    p.setUnit(a);
                    p.activate();
                    p.sprite.body.setSize(10,10,false);
                    p.sprite.body.setOffset(19,45);
                    p.life=10;
                    this.pgroup.add(p.sprite);
                    this.record(p);
                    break;
                default:break;
                }
            });
            this.main.physics.overlap(this.pgroup,this.ptngroup,(a,b)=>{
                a=a as Phaser.Types.Physics.Arcade.GameObjectWithBody;
                b=b as Phaser.Types.Physics.Arcade.GameObjectWithBody;
                const p=this.getPlayer(a);
                switch(b.state){
                case PotionType.SPEED:
                    p.speedtime=10000;
                    break;
                case PotionType.ATTACK:
                    p.attacktime=10000;
                    break;
                default:break;
                }
                b.destroy();
            });
            //this.main.physics.world.disable(this.egroup);
            this.egroup.clear();
        });
        this.launch();
    }

    start(b:Bubble,s:number){
        b.activate();
        b.sprite.play(`${SpriteKey.BUB}${b.type}`);
        this.board.scene.time.addEvent({
            delay:s,
            callback:()=>{
                this.pop(b);
                b.sprite.destroy();
            }
        });
    }
    pop(b:Bubble){
        this.main.sound.play("explode");
        switch(b.type){
        case BubbleType.BLUE:
            for(let i=0;i<=(b.attack?3:2);i++){
                IterateUtils.iterateX(i,v=>{
                    const x=b.getUnit().add(v);
                    if(!this.board.check(x))return;
                    const l=new Explosion(this.board,ExplosionType.O);
                    this.egroup.add(l.sprite);
                    l.setUnit(x);
                    l.activate();
                    this.main.time.addEvent({
                        delay:500,
                        callback:()=>{
                            l.sprite.destroy();
                        }
                    });
                });
            }
            break;
        case BubbleType.RED:
            if(b.attack){
                IterateUtils.iterateO(1,1,v=>{
                    const x=b.getUnit().add(v);
                    if(!this.board.check(x))return;
                    const l=new Explosion(this.board,ExplosionType.RED);
                    this.egroup.add(l.sprite);
                    l.setUnit(x);
                    l.activate();
                    this.main.time.addEvent({
                        delay:500,
                        callback:()=>{
                            l.sprite.destroy();
                        }
                    });
                });
                IterateUtils.iterateH(2,0,v=>{
                    const x=b.getUnit().add(v);
                    if(!this.board.check(x))return;
                    const l=new Explosion(this.board,ExplosionType.O);
                    this.egroup.add(l.sprite);
                    l.setUnit(x);
                    l.activate();
                    this.main.time.addEvent({
                        delay:500,
                        callback:()=>{
                            l.sprite.destroy();
                        }
                    });
                });
                break;
            }
            for(let i=0;i<=1;i++){
                IterateUtils.iterateX(i,v=>{
                    const x=b.getUnit().add(v);
                    if(!this.board.check(x))return;
                    const l=new Explosion(this.board,ExplosionType.RED);
                    this.egroup.add(l.sprite);
                    l.setUnit(x);
                    l.activate();
                    this.main.time.addEvent({
                        delay:500,
                        callback:()=>{
                            l.sprite.destroy();
                        }
                    });
                });
            }
            IterateUtils.iterateH(1,1,v=>{
                const x=b.getUnit().add(v);
                if(!this.board.check(x))return;
                const l=new Explosion(this.board,ExplosionType.O);
                this.egroup.add(l.sprite);
                l.setUnit(x);
                l.activate();
                this.main.time.addEvent({
                    delay:500,
                    callback:()=>{
                        l.sprite.destroy();
                    }
                });
            });
            break;
        case BubbleType.GREEN:
            for(let i=0;i<this.board.map.width;i++){
                const l=new Explosion(this.board,ExplosionType.O);
                this.egroup.add(l.sprite);
                l.setUnit(new Phaser.Math.Vector2(i,b.getUnit().y));
                l.activate();
                this.main.time.addEvent({
                    delay:500,
                    callback:()=>{
                        l.sprite.destroy();
                    }
                });
            }
            for(let j=0;j<this.board.map.height;j++){
                if(j==b.getUnit().y){
                    continue;
                }
                const l=new Explosion(this.board,ExplosionType.O);
                this.egroup.add(l.sprite);
                l.setUnit(new Phaser.Math.Vector2(b.getUnit().x,j));
                l.activate();
                this.main.time.addEvent({
                    delay:500,
                    callback:()=>{
                        l.sprite.destroy();
                    }
                });
            }
            break;
        case BubbleType.BLACK:
            IterateUtils.iterateX(1,v=>{
                const x=b.getUnit().add(v);
                if(!this.board.check(x))return;
                const l=new Explosion(this.board,ExplosionType.BLACK);
                this.egroup.add(l.sprite);
                l.setUnit(x);
                l.activate();
                this.main.time.addEvent({
                    delay:500,
                    callback:()=>{
                        l.sprite.destroy();
                    }
                });
            });
            break;
        case BubbleType.PURPLE:
            IterateUtils.iterateO(1,1,v=>{
                const x=b.getUnit().add(v);
                if(!this.board.check(x))return;
                if(!this.board.hasBox(x))return;
                const l=new Explosion(this.board,ExplosionType.RED);
                this.egroup.add(l.sprite);
                l.setUnit(x);
                l.activate();
                this.main.time.addEvent({
                    delay:500,
                    callback:()=>{
                        l.sprite.destroy();
                    }
                });
            });
            break;
        default:break;
        }
    }
    gen(){
        this.gens++;
        for(let i=0;i<this.board.map.width;i++){
            for(let j=0;j<this.board.map.height;j++){
                if(!this.safe({x:i,y:j}))continue;
                //if(this.player.getPosition().distance(this.board.cent({x:i,y:j}))<2*this.board.map.tileWidth)continue;
                const t=this.board.ground.getTileAt(i,j,true).index;
                if(t!=Terrain.EMPTY)continue;
                if(this.board.hasBox(new Phaser.Math.Vector2(i,j)))continue;
                if(Math.random()<4/(this.gens+10))continue;
                //const l=[Math.max(0,0.1*(this.gens-3)),Math.max(0,0.2*(this.gens-2)),Math.max(0,0.3*(this.gens-2)),0.05*(this.gens-1),0.05*(this.gens-1),0.1*this.gens,0.1*this.gens,0.5*this.gens,0.5*Math.sqrt(this.gens)];
                const l=[0.1*this.gens,1,0,5,1,0.5*Math.sqrt(this.gens),1,2,Math.sqrt(this.gens),6,3];
                const tp=[BoxType.MAN,BoxType.SILVER,BoxType.GOLD,BoxType.DARK,BoxType.PURPLE,BoxType.GREEN,BoxType.BLACK,BoxType.RED,BoxType.BLUE,BoxType.N,BoxType.O];
                const res=Math.random()*l.reduce((p,a)=>p+a);
                let s=0;
                for(let k=0;k<11;k++){
                    s+=l[k];
                    if(res<s){
                        this.board.box.putTileAt(tp[k],i,j,true);
                        break;
                    }

                }
            }
        }
    }
    record(p:Player){
        this.players.set(++this.newi,p);
        p.sprite.state=this.newi;
    }
    getPlayer(sprite:Phaser.Types.Physics.Arcade.GameObjectWithBody){
        const r=this.players.get(sprite.state as number);
        if(r===undefined)throw new Error("Player not found");
        return r;
    }
    quitResult(){
       return {winner:"None"};
    }
    reset(){
        this.time=120000;
        this.newi=0;
        this.players.clear();
        this.norm=true;
    }
    cleanUp(){
        this.main.sound.stopAll();
    }
    land(){
        let x,y;
        do{
            x=Math.floor(Math.random()*this.board.map.width);
            y=Math.floor(Math.random()*this.board.map.height);
        }while(this.board.ground.getTileAt(x,y).index!=Terrain.EMPTY||this.board.hasBox(new Phaser.Math.Vector2(x,y)));
        const p=new Player(this.board,PlayerKey.BOY,"Bot");
        p.setUnit(new Phaser.Math.Vector2(x,y));
        p.activate();
        p.sprite.body.setSize(10,10,false);
        p.sprite.body.setOffset(19,45);
        p.life=10;
        this.pgroup.add(p.sprite);
        this.record(p);
        return p;
    }
    landPotion(type:PotionType){
        let x,y;
        do{
            x=Math.floor(Math.random()*this.board.map.width);
            y=Math.floor(Math.random()*this.board.map.height);
        }while(this.board.ground.getTileAt(x,y).index!=Terrain.EMPTY||!this.safe({x,y}));
        const p=new Potion(this.board,type);
        p.setUnit(new Phaser.Math.Vector2(x,y));
        p.activate();
        this.ptngroup.add(p.sprite);
        return p;
    }
    safe({x,y}:Phaser.Types.Math.Vector2Like){
        for(const player of this.players.values()){
            if(player.getPosition().distance(this.board.cent({x,y}))<2*this.board.map.tileWidth){
                return false;
            }
        }
        return true;
    }
}
