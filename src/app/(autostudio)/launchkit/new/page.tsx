import { LaunchkitLPForm } from '../_components/launchkit-lp-form';

export default function NewLaunchkitLPPage() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">新規LaunchKit LP登録</h1>
      </header>
      <LaunchkitLPForm mode="create" />
    </div>
  );
}
