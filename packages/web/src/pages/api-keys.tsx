import { Layout } from '@/components/layout';
import { ApiKeysContent } from '@/components/api-keys-content';

export function ApiKeysPage() {
  return (
    <Layout onCommandPalette={() => {}}>
      <div className="mx-auto max-w-3xl p-6">
        <ApiKeysContent />
      </div>
    </Layout>
  );
}
