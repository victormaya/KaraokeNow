import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer/Footer";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Política de Privacidade do KaraokeNow — como coletamos, usamos e protegemos seus dados.",
};

export default function PrivacidadePage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link href="/" className={styles.back}>← Voltar ao KaraokeNow</Link>

        <h1 className={styles.title}>Política de Privacidade</h1>
        <p className={styles.updated}>Última atualização: maio de 2025</p>

        <section className={styles.section}>
          <h2>1. Quem somos</h2>
          <p>
            O <strong>KaraokeNow</strong> é um serviço online de karaokê que remove vocais de músicas do YouTube
            em tempo real, operado por <strong>Victor Maya</strong>. Para dúvidas sobre privacidade, entre em
            contato pelo e-mail <a href="mailto:victor.maya42@gmail.com">victor.maya42@gmail.com</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. Dados que coletamos</h2>
          <p>O KaraokeNow não exige cadastro nem login. Os únicos dados tratados são:</p>
          <ul>
            <li><strong>Endereço IP:</strong> registrado automaticamente nos logs do servidor a cada requisição, como ocorre em qualquer site.</li>
            <li><strong>Termos de busca:</strong> as consultas que você digita na busca são enviadas ao nosso servidor para pesquisar vídeos no YouTube. Não são armazenadas de forma permanente.</li>
            <li><strong>Identificador de vídeo do YouTube:</strong> o ID do vídeo escolhido é usado para baixar e processar o áudio. O arquivo de áudio é armazenado em nosso servidor para evitar reprocessamentos futuros.</li>
          </ul>
          <p>Não coletamos nome, e-mail, CPF, dados de pagamento, localização precisa nem qualquer dado sensível.</p>
        </section>

        <section className={styles.section}>
          <h2>3. Como usamos os dados</h2>
          <ul>
            <li>Processar sua solicitação de karaokê;</li>
            <li>Manter os logs operacionais do servidor (segurança e diagnóstico de erros);</li>
            <li>Armazenar o áudio processado em cache para que outros usuários da mesma música não precisem aguardar o processamento.</li>
          </ul>
          <p>
            A base legal para esse tratamento é o <strong>legítimo interesse</strong> na operação do serviço
            (art. 7º, IX da LGPD), uma vez que o tratamento é mínimo e necessário para a funcionalidade oferecida.
          </p>
        </section>

        <section className={styles.section}>
          <h2>4. Compartilhamento com terceiros</h2>
          <p>Para funcionar, o KaraokeNow utiliza os seguintes serviços de terceiros:</p>
          <ul>
            <li>
              <strong>Replicate (EUA):</strong> o áudio baixado do YouTube é enviado à plataforma Replicate para
              remoção de vocais com inteligência artificial (modelo Demucs). O Replicate processa o arquivo e o
              descarta após a conclusão. Consulte a{" "}
              <a href="https://replicate.com/privacy" target="_blank" rel="noopener noreferrer">
                política de privacidade da Replicate
              </a>.
            </li>
            <li>
              <strong>YouTube / Google:</strong> o áudio é obtido diretamente do YouTube. O uso é regido pelos{" "}
              <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
                Termos de Serviço do YouTube
              </a>.
            </li>
            <li>
              <strong>Apple Music (iTunes API):</strong> utilizado para exibir os charts de músicas em alta.
              Nenhum dado do usuário é enviado a esse serviço.
            </li>
            <li>
              <strong>LRCLib:</strong> serviço de letras sincronizadas consultado para exibição da letra durante
              o karaokê. Nenhum dado do usuário é enviado além do título da música.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>5. Transferência internacional de dados</h2>
          <p>
            O áudio processado é enviado à <strong>Replicate</strong>, empresa sediada nos Estados Unidos.
            Essa transferência é necessária para a prestação do serviço e ocorre com base no legítimo interesse
            e nas garantias contratuais adotadas pela Replicate (art. 33 da LGPD).
          </p>
        </section>

        <section className={styles.section}>
          <h2>6. Retenção de dados</h2>
          <ul>
            <li><strong>Logs de servidor (IP):</strong> retidos por até 30 dias e então descartados automaticamente.</li>
            <li><strong>Cache de áudio:</strong> os arquivos de áudio processados são mantidos indefinidamente no servidor para melhorar a experiência de usuários futuros. Não há vínculo entre o arquivo armazenado e o usuário que o solicitou.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>7. Seus direitos (LGPD)</h2>
          <p>
            Nos termos do art. 18 da Lei 13.709/2018 (LGPD), você tem direito a confirmar a existência de
            tratamento, acessar seus dados, solicitar correção, portabilidade, eliminação e informações sobre
            compartilhamento. Para exercer qualquer direito, entre em contato pelo e-mail{" "}
            <a href="mailto:victor.maya42@gmail.com">victor.maya42@gmail.com</a>.
          </p>
          <p>
            Como não coletamos dados identificáveis além do IP (que não é associado a nenhuma conta), a maioria
            das solicitações se limitará a esclarecimentos sobre as práticas descritas nesta política.
          </p>
        </section>

        <section className={styles.section}>
          <h2>8. Cookies e rastreamento</h2>
          <p>
            O KaraokeNow <strong>não utiliza cookies de rastreamento</strong>, ferramentas de análise de
            comportamento (como Google Analytics) nem publicidade personalizada. O único armazenamento local
            utilizado é o necessário para o funcionamento do próprio navegador (cache de rede).
          </p>
        </section>

        <section className={styles.section}>
          <h2>9. Alterações nesta política</h2>
          <p>
            Podemos atualizar esta política periodicamente. A data de última atualização sempre estará indicada
            no topo desta página. Recomendamos revisá-la periodicamente.
          </p>
        </section>

        <section className={styles.section}>
          <h2>10. Contato</h2>
          <p>
            Dúvidas ou solicitações relacionadas à privacidade podem ser enviadas para{" "}
            <a href="mailto:victor.maya42@gmail.com">victor.maya42@gmail.com</a>.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
