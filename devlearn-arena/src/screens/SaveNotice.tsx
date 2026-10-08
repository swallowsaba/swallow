import { Icon } from '@/ui/icons/Icon';
import { useSaveStatus } from './saveStatus';
import './SaveNotice.css';

/** 保存に失敗した・保存データを読めなかった時に、何が起きたかを 1 行で知らせる（docs/ui-design.md 9 章） */
export function SaveNotice() {
  const { message, set } = useSaveStatus();
  if (message === null) return null;
  return (
    <div className="save-notice" role="alert" data-testid="save-notice">
      <Icon name="alert" size={16} />
      <span className="save-notice-text" title={message}>{message}</span>
      <button type="button" className="save-notice-close" aria-label="知らせを閉じる" onClick={() => set(null)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
