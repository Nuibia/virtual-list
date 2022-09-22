import * as React from 'react';
import List from '../src/List';

interface Item {
  id: number;
  height: number;
}
//TODO:jiangniao item组件，充当list的children
const MyItem: React.ForwardRefRenderFunction<HTMLElement, Item> = ({ id, height }, ref) => {
  return (
    <span
      ref={ref}
      style={{
        border: '1px solid gray',
        padding: '0 16px',
        height,
        lineHeight: '30px',
        boxSizing: 'border-box',
        display: 'inline-block',
      }}
    >
      {id}
    </span>
  );
};

const ForwardMyItem = React.forwardRef(MyItem);
//TODO:jiangniao 双数列高度为 30，单数列为 30+70 = 100
const data: Item[] = [];
for (let i = 0; i < 100; i += 1) {
  data.push({
    id: i,
    height: 30 + (i % 2 ? 70 : 0),
  });
}

const Demo = () => {
  return (
    <React.StrictMode>
      <div>
        <h2>Dynamic Height</h2>

        <List
          data={data}
          //TODO:jiangniao 可视窗口高度
          height={500}
          //TODO:jiangniao 每一项的最小高度
          itemHeight={30}
          //TODO:jiangniao 每一项key值
          itemKey="id"
          style={{
            border: '1px solid red',
            boxSizing: 'border-box',
          }}
        >
          {item => <ForwardMyItem {...item} />}
        </List>
      </div>
    </React.StrictMode>
  );
};

export default Demo;
