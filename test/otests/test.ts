import { messageFactory } from '../output';

function test() {
    const rst = messageFactory.create(71, new ArrayBuffer(1024), 0);
    console.log(rst.buildSelf());
    const ary = rst.points.pushElement();
    const pnt = ary.pushElement();
    pnt.x = 123.4;
    pnt.y = 2344.55;

    console.log(`(${pnt.x}, ${pnt.y})`);
}

test();

