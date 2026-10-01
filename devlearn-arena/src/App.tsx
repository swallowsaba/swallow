import { useRoute } from './router';
import { CityScreen } from './screens/city/CityScreen';

/** 画面の切り替え（docs/ui-design.md 2 章）。起動直後は都市画面 */
export function App() {
  const route = useRoute();
  return (
    <>
      {route.name === 'city' ? <CityScreen /> : null}
      <div className="too-small" role="alert">
        <h1>PC の大きな画面で遊んでください</h1>
        <p>このゲームは横 1280・縦 720 以上の画面に合わせて作っています。</p>
      </div>
    </>
  );
}
