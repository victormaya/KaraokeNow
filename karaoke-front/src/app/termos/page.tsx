import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer/Footer";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos de Uso do KaraokeNow — condições para utilização do serviço.",
};

export default function TermosPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link href="/" className={styles.back}>← Voltar ao KaraokeNow</Link>

        <h1 className={styles.title}>Termos de Uso</h1>
        <p className={styles.updated}>Última atualização: maio de 2025</p>

        <section className={styles.section}>
          <h2>1. Aceitação</h2>
          <p>
            Ao acessar e utilizar o <strong>KaraokeNow</strong>, você concorda com estes Termos de Uso.
            Se não concordar com alguma condição, por favor, não utilize o serviço.
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. Descrição do serviço</h2>
          <p>
            O KaraokeNow é uma ferramenta que permite buscar vídeos no YouTube, remover os vocais do áudio
            usando inteligência artificial e exibir a letra sincronizada, possibilitando a prática de karaokê
            de forma gratuita e sem necessidade de cadastro.
          </p>
        </section>

        <section className={styles.section}>
          <h2>3. Uso permitido</h2>
          <p>O serviço é disponibilizado exclusivamente para:</p>
          <ul>
            <li>Uso pessoal e recreativo;</li>
            <li>Prática e entretenimento individual;</li>
            <li>Fins educacionais não comerciais.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>4. Uso proibido</h2>
          <p>É vedado:</p>
          <ul>
            <li>Utilizar o serviço para fins comerciais sem autorização dos detentores dos direitos autorais;</li>
            <li>Distribuir, republicar ou monetizar o áudio processado;</li>
            <li>Realizar engenharia reversa, scraping automatizado ou abusar da infraestrutura do serviço;</li>
            <li>Utilizar o serviço de forma que viole as leis brasileiras ou internacionais aplicáveis.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>5. Propriedade intelectual e conteúdo do YouTube</h2>
          <p>
            Todo o conteúdo de áudio processado pelo KaraokeNow é originado do YouTube e pertence aos seus
            respectivos detentores de direitos autorais. O KaraokeNow não reivindica propriedade sobre esse
            conteúdo e não o distribui comercialmente.
          </p>
          <p>
            O uso do YouTube pelo serviço é regido pelos{" "}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
              Termos de Serviço do YouTube
            </a>{" "}
            e pelas{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Políticas de Privacidade do Google
            </a>.
            O usuário é responsável por garantir que o uso que faz do conteúdo está em conformidade com a
            legislação de direitos autorais aplicável.
          </p>
        </section>

        <section className={styles.section}>
          <h2>6. Disponibilidade do serviço</h2>
          <p>
            O KaraokeNow é oferecido <strong>gratuitamente e sem garantias de disponibilidade contínua</strong>.
            O serviço pode ser interrompido, modificado ou encerrado a qualquer momento sem aviso prévio.
          </p>
        </section>

        <section className={styles.section}>
          <h2>7. Isenção de responsabilidade</h2>
          <p>
            O KaraokeNow é fornecido "no estado em que se encontra", sem garantias de qualquer tipo.
            O operador não se responsabiliza por danos diretos ou indiretos decorrentes do uso ou
            impossibilidade de uso do serviço, falhas de processamento, indisponibilidade de conteúdo no
            YouTube ou qualquer outro fator fora de seu controle.
          </p>
        </section>

        <section className={styles.section}>
          <h2>8. Alterações nos termos</h2>
          <p>
            Estes termos podem ser atualizados a qualquer momento. A data de última atualização estará sempre
            indicada no topo desta página. O uso continuado do serviço após alterações implica aceitação dos
            novos termos.
          </p>
        </section>

        <section className={styles.section}>
          <h2>9. Lei aplicável</h2>
          <p>
            Estes Termos são regidos pela legislação brasileira. Fica eleito o foro da comarca de domicílio
            do operador para resolução de eventuais conflitos.
          </p>
        </section>

        <section className={styles.section}>
          <h2>10. Contato</h2>
          <p>
            Para dúvidas sobre estes termos, entre em contato pelo e-mail{" "}
            <a href="mailto:victor.maya42@gmail.com">victor.maya42@gmail.com</a>.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
