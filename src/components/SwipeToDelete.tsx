import { useState, useRef, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

interface SwipeToDeleteProps {
  onDelete: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * 左滑删除（手机）+ 悬停露出删除（电脑）的通用组件。
 * 手机端：手指左滑 >20px 露出红色"删除"按钮，右滑收起。
 * 电脑端：鼠标悬停时右上角露出小垃圾桶图标。
 */
export default function SwipeToDelete({ onDelete, children, className = '' }: SwipeToDeleteProps) {
  const [revealed, setRevealed] = useState(false);
  const touchStart = useRef({ x: 0, y: 0 });

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation(); // 防止嵌套 SwipeToDelete 同时触发
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation(); // 防止嵌套 SwipeToDelete 同时触发
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    // 只处理明显水平方向的滑动（水平位移 > 垂直位移的 1.5 倍）
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 20) {
      if (dx < 0) setRevealed(true);
      else setRevealed(false);
    }
  };

  return (
    <div className={`relative overflow-hidden group ${className}`}>
      {/* 手机端：左滑露出的红色删除按钮 */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute right-0 top-0 bottom-0 w-14 bg-red-500 text-white text-xs font-medium flex items-center justify-center [@media(hover:hover)]:hidden"
      >
        删除
      </button>

      <div
        className={`relative transition-transform duration-200 ${revealed ? '-translate-x-14' : 'translate-x-0'}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        {/* 电脑端：悬停露出的小垃圾桶 */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-sage-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity [@media(hover:none)]:hidden z-10"
        >
          <Trash2 size={15} />
        </button>
        {children}
      </div>
    </div>
  );
}
