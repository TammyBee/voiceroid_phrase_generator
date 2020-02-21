class MarkovChain {
    constructor(segments) {
        this.map = new Map();
        for (let i = 0; i < segments.length - 1; i++) {
            let seg1 = segments[i];
            let seg2 = segments[i + 1];
            if (this.map.has(seg1)) {
                this.map.get(seg1).push(seg2);
            } else {
                this.map.set(seg1, [seg2]);
            }
        }
    }

    generate_sentence_internal(start_segment, stop_segment) {
        if (!this.map.has(start_segment)) {
            return "<Error> 指定した開始単語から文を生成できませんでした。";
        }

        let sentence = "";
        let previous_segment = start_segment;
        while (true) {
            sentence += previous_segment;

            let candidates = this.map.get(previous_segment);
            previous_segment = candidates[Math.floor(Math.random() * candidates.length)]
            if (!this.map.has(previous_segment)) {
                break;
            }
            if (previous_segment === stop_segment) {
                break;
            }
        }

        return sentence;
    }

    generate_sentence(start_segment, stop_segment, contain_strings, min_length, max_length, max_number_of_trials) {
        for (let i = 0; i < max_number_of_trials; i++) {
            let sentence = this.generate_sentence_internal(start_segment, stop_segment);
            if (sentence.length >= min_length && sentence.length <= max_length && contain_strings.every(s => sentence.includes(s))) {
                return sentence;
            }
        }
        return "[Error] 指定した条件の文を生成できませんでした。";
    }
}

const BOS_SYMBOL = '<BOS>';
const LOCAL_STORAGE_KEY_SEPARATED_SENTENCES = 'vpg_separated_sentences';

let separated_sentences;
let markov_chain_model;

window.onload = function() {
    const button_build_model = document.getElementById('button_build_model');
    const button_delete_model = document.getElementById('button_delete_model');
    const button_generate_sentences = document.getElementById('button_generate_sentences');

    if (localStorage[LOCAL_STORAGE_KEY_SEPARATED_SENTENCES] != undefined) {
        separated_sentences = JSON.parse(localStorage[LOCAL_STORAGE_KEY_SEPARATED_SENTENCES])["result"];
        build_current_model_view(separated_sentences);
        markov_chain_model = build_markov_chain_model(separated_sentences, BOS_SYMBOL);
        if (markov_chain_model !== undefined) {
            button_delete_model.disabled = false;
            button_generate_sentences.disabled = false;
        }
    }

    function fetchSeparatedSentences(pdic_file) {
        const upload = (file) => {
            /* https://flask-janome-api.herokuapp.com/separate_pdic */
            fetch('https://flask-janome-api.herokuapp.com/separate_pdic', {
                method: 'POST',
                headers: {
                    "Content-Type": "text/plain"
                },
                body: file
            }).then(response => {
                return response.json().then(data => {
                    console.log(data)
                    separated_sentences = data["result"];
                    build_current_model_view(separated_sentences);
                    localStorage[LOCAL_STORAGE_KEY_SEPARATED_SENTENCES] = JSON.stringify(data);
                    markov_chain_model = build_markov_chain_model(separated_sentences, BOS_SYMBOL);
                    if (markov_chain_model !== undefined) {
                        button_delete_model.disabled = false;
                        button_generate_sentences.disabled = false;
                    }
                });
            }).catch(
                error => {
                    alert("[ERROR]\nモデルを生成できませんでした。\nしばらく待ってから、やり直してください。\nこのアラートが何度も出る場合は、作者に報告してください。")
                    console.log(error)
                }
            ).finally(() => {
                button_build_model.disabled = false;
                button_build_model.value = "モデル生成";
            });
        };

        upload(pdic_file);
    }

    function build_markov_chain_model(separated_sentences, bos_symbol) {
        segments = []
        for (let separated_sentence of separated_sentences) {
            segments.push(bos_symbol);
            Array.prototype.push.apply(segments, separated_sentence);
        }
        return new MarkovChain(segments);
    }

    function build_current_model_view(separated_sentences) {
        const number_of_phrases = document.getElementById("view_model_info_number_of_phrases");
        const number_of_segments = document.getElementById("view_model_info_number_of_segments");

        if (separated_sentences == undefined) {
            number_of_phrases.innerHTML = "-";
            number_of_segments.innerHTML = "-";
            return;
        }

        number_of_phrases.innerHTML = separated_sentences.length;

        let count = 0;
        for (let sentence of separated_sentences) {
            count += sentence.length;
        }
        number_of_segments.innerHTML = count;
    }

    function build_result_view(generated_sentences) {
        let view = `<table>`;
        for (let sentence of generated_sentences) {
            view += `<tr><td>${sentence}</td></tr>`;
        }
        view += `</table>`;

        const result = document.getElementById("view_result_generated_sentences");
        result.innerHTML = view;
    }

    button_build_model.addEventListener("click", () => {
        const input_txt_file = document.getElementById('input_txt_file');

        let files = input_txt_file.files;
        if (files.length == 0) {
            alert("[Error]\nファイルを選択していません。");
            return;
        }

        button_build_model.disabled = true;
        button_build_model.value = "生成中...";

        fetchSeparatedSentences(files[0]);
    })

    button_delete_model.addEventListener("click", () => {
        let result = window.confirm("現在のモデルを削除しますか？");
        if (!result) {
            return;
        }

        localStorage.removeItem(LOCAL_STORAGE_KEY_SEPARATED_SENTENCES);
        separated_sentences = undefined;
        markov_chain_model = undefined;

        build_current_model_view(separated_sentences);
        button_delete_model.disabled = true;
        button_generate_sentences.disabled = true;
    })

    button_generate_sentences.addEventListener("click", () => {
        if (markov_chain_model == undefined) {
            alert("[Error]\n文を生成するためのモデルが生成されていません。");
            return;
        }

        let input_start_word = document.getElementById('input_start_word').value;
        const input_contain_string = document.getElementById('input_contain_string').value.split(',');
        const number_of_sentences = Number(document.getElementById('input_number_of_sentences').value);
        let min_sentence_length = Number(document.getElementById('input_min_sentence_length').value);
        let max_sentence_length = Number(document.getElementById('input_max_sentence_length').value);
        const max_number_of_trials = Number(document.getElementById('input_max_number_of_trials').value);
        const to_halfwidth = document.getElementById('checkbox_to_halfwidth').checked;

        const starts_with_bos_symbol = (input_start_word === "");
        if (starts_with_bos_symbol) {
            input_start_word = BOS_SYMBOL;
            min_sentence_length += BOS_SYMBOL.length;
            max_sentence_length += BOS_SYMBOL.length;
        }

        let generated_sentences = [];
        for (let i = 0; i < number_of_sentences; i++) {
            let generated_sentence = markov_chain_model.generate_sentence(input_start_word, BOS_SYMBOL, input_contain_string, min_sentence_length, max_sentence_length, max_number_of_trials);
            if (starts_with_bos_symbol) {
                generated_sentence = generated_sentence.slice(BOS_SYMBOL.length);
            }
            if (to_halfwidth) {
                generated_sentence = generated_sentence.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
                    return String.fromCharCode(s.charCodeAt(0) - 65248);
                });
            }
            generated_sentences.push(generated_sentence);
        }

        build_result_view(generated_sentences);
    })

}
