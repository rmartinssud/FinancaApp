import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import Container from "./Container.jsx";
import SectionTitle from "./SectionTitle.jsx";
import UmSVG from "../assets/1azul.svg";
import Budget from "../assets/icon-budget.svg";

const temas = [
  { img: Budget, titulo: "Orçamento Consciente", texto: "Passos para criar e seguir um orçamento eficaz, equilibrando renda e despesas." },
  { img: UmSVG, titulo: "Superação de Dívidas", texto: "Estratégias práticas para entender e se livrar das dívidas de maneira responsável." },
  { img: UmSVG, titulo: "Investimentos para o Futuro", texto: "Fundamentos e orientações sobre como começar a investir de forma segura e eficaz." },
  { img: UmSVG, titulo: "Proteção Financeira Familiar", texto: "Como planejar para adversidades e proteger financeiramente a família." },
  { img: UmSVG, titulo: "Doação e Abençoar Outros", texto: "A importância de doar e contribuir para o bem-estar da comunidade." },
];

// Carrossel de temas. Mostra 1, 2 ou 3 cards conforme a largura da tela.
function CarouselCards() {
  return (
    <section className="px-3 sm:px-6">
      <div className="relative mx-auto max-w-[1460px] overflow-hidden rounded-[48px] bg-soft py-16 drop-shadow-xl md:py-24">
        <div className="absolute -left-52 bottom-0 h-[400px] w-[600px] translate-y-1/2 rounded-full bg-primary blur-[150px]" />
        <div className="absolute -right-72 top-8 h-[400px] w-[600px] translate-y-28 rounded-full bg-sky-200 blur-[100px]" />

        <Container className="relative">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
            <SectionTitle antes="Aprenda a cuidar do" destaque="seu dinheiro" />
            <p className="text-slate-600">
              Conteúdos práticos para você ficar no controle do orçamento de uma vez por todas: dívidas, entradas e
              saídas, cartões de crédito e débito, reserva e futuro.
            </p>
          </div>
        </Container>

        <div className="relative mt-10 px-5 sm:px-8">
          <Swiper
            modules={[Autoplay, Pagination]}
            loop={true}
            speed={800}
            grabCursor={true}
            centeredSlides={true}
            autoplay={{ delay: 3500, disableOnInteraction: false }}
            pagination={{ clickable: true }}
            // Quantos cards aparecem em cada largura de tela
            breakpoints={{
              0: { slidesPerView: 1, spaceBetween: 16 },
              768: { slidesPerView: 2, spaceBetween: 24, centeredSlides: false },
              1024: { slidesPerView: 3, spaceBetween: 32, centeredSlides: true },
            }}
            className="!pb-14"
          >
            {temas.map((t) => (
              <SwiperSlide key={t.titulo} className="!h-auto py-4">
                <div className="flex h-full flex-col items-center rounded-[28px] bg-white px-6 pb-8 pt-12 text-center shadow-xl">
                  <img src={t.img} alt="" className="h-28 w-28" />
                  <h3 className="mt-6 text-2xl font-medium">{t.titulo}</h3>
                  <p className="mt-4 text-slate-500">{t.texto}</p>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </div>
    </section>
  );
}

export default CarouselCards;
