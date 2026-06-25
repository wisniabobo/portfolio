const docSelector = document.getElementById('doc-type');
const detailLabel1 = document.getElementById('detail-label-1');
const detailLabel2 = document.getElementById('detail-label-2');
const detail1 = document.getElementById('detail-1');
const detail2 = document.getElementById('detail-2');
const preview = document.getElementById('document-preview');

// Texts mapping
const fieldsMap = {
    'zwrot': {
        l1: 'Przedmiot umowy (co zwracasz?):',
        p1: 'np. Buty sportowe X',
        l2: 'Data zawarcia umowy / odbioru:',
        p2: 'np. 15.10.2026',
        title: 'OŚWIADCZENIE O ODSTĄPIENIU OD UMOWY ZAWARTEJ NA ODLEGŁOŚĆ'
    },
    'reklamacja': {
        l1: 'Reklamowany towar:',
        p1: 'np. Telefon Y - nie włącza się',
        l2: 'Data zauważenia wady:',
        p2: 'np. 20.10.2026',
        title: 'REKLAMACJA TOWARU Z TYTUŁU RĘKOJMI'
    },
    'wezwanie': {
        l1: 'Tytuł zobowiązania (np. nr faktury):',
        p1: 'np. Faktura VAT 12/2026',
        l2: 'Kwota do zapłaty (PLN):',
        p2: 'np. 1500,00',
        title: 'PRZEDSĄDOWE WEZWANIE DO ZAPŁATY'
    }
};

docSelector.addEventListener('change', (e) => {
    const type = e.target.value;
    const map = fieldsMap[type];
    detailLabel1.innerText = map.l1;
    detail1.placeholder = map.p1;
    detailLabel2.innerText = map.l2;
    detail2.placeholder = map.p2;
    
    // Clear details to prompt user to fill
    detail1.value = '';
    detail2.value = '';
});

function generateDocument() {
    const type = docSelector.value;
    const userName = document.getElementById('user-name').value;
    const userAddr = document.getElementById('user-address').value.replace(/\n/g, '<br>');
    const targetName = document.getElementById('target-name').value;
    const targetAddr = document.getElementById('target-address').value.replace(/\n/g, '<br>');
    const datePlace = document.getElementById('date-place').value;
    const d1 = detail1.value;
    const d2 = detail2.value;

    let content = '';

    if (type === 'zwrot') {
        content = `
            <div class="right-align">${datePlace}</div>
            <div>
                <strong>Dane Konsumenta:</strong><br>
                ${userName}<br>
                ${userAddr}
            </div>
            <div class="right-align" style="margin-top: 30px;">
                <strong>Dane Sprzedawcy:</strong><br>
                ${targetName}<br>
                ${targetAddr}
            </div>
            <div class="center-align">${fieldsMap[type].title}</div>
            <p>Oświadczam, że zgodnie z art. 27 ustawy z dnia 30 maja 2014 r. o prawach konsumenta (Dz.U. 2014 poz. 827 ze zm.) odstępuję od umowy zawartej na odległość.</p>
            <p><strong>Przedmiot umowy:</strong> ${d1}</p>
            <p><strong>Data zawarcia umowy / odbioru towaru:</strong> ${d2}</p>
            <p>Proszę o zwrot uiszczonej kwoty na rachunek bankowy, z którego dokonano płatności.</p>
            <br><br><br>
            <div style="text-align: right; margin-top: 50px;">.........................................................<br><small>Własnoręczny podpis konsumenta</small></div>
        `;
    } else if (type === 'reklamacja') {
        content = `
            <div class="right-align">${datePlace}</div>
            <div>
                <strong>Dane Reklamującego:</strong><br>
                ${userName}<br>
                ${userAddr}
            </div>
            <div class="right-align" style="margin-top: 30px;">
                <strong>Dane Sprzedawcy:</strong><br>
                ${targetName}<br>
                ${targetAddr}
            </div>
            <div class="center-align">${fieldsMap[type].title}</div>
            <p>Zawiadamiam, iż zakupiony przeze mnie towar: <strong>${d1}</strong> jest niezgodny z umową / posiada wadę fizyczną.</p>
            <p><strong>Wadę zauważono w dniu:</strong> ${d2}</p>
            <p>Z uwagi na powyższe, na podstawie przepisów o rękojmi za wady rzeczy sprzedanej (art. 556 i nast. Kodeksu cywilnego), żądam bezpłatnej naprawy towaru lub wymiany towaru na nowy, wolny od wad.</p>
            <br><br><br>
            <div style="text-align: right; margin-top: 50px;">.........................................................<br><small>Czytelny podpis</small></div>
        `;
    } else if (type === 'wezwanie') {
        content = `
            <div class="right-align">${datePlace}</div>
            <div>
                <strong>Wierzyciel:</strong><br>
                ${userName}<br>
                ${userAddr}
            </div>
            <div class="right-align" style="margin-top: 30px;">
                <strong>Dłużnik:</strong><br>
                ${targetName}<br>
                ${targetAddr}
            </div>
            <div class="center-align">${fieldsMap[type].title}</div>
            <p>Wzywam do zapłaty bezspornej kwoty w wysokości <strong>${d2} PLN</strong> w nieprzekraczalnym terminie 7 dni od daty doręczenia niniejszego wezwania.</p>
            <p>Zadłużenie wynika z braku zapłaty z tytułu: <strong>${d1}</strong>.</p>
            <p>Brak wpłaty we wskazanym terminie spowoduje skierowanie sprawy na drogę postępowania sądowego, a w konsekwencji egzekucji komorniczej, co narazi Państwa na dodatkowe, wysokie koszty.</p>
            <br><br><br>
            <div style="text-align: right; margin-top: 50px;">.........................................................<br><small>Czytelny podpis wierzyciela</small></div>
        `;
    }

    preview.innerHTML = content;
}
