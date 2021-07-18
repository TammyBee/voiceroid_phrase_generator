const BOS_SYMBOL = '<BOS>';
const LOCAL_STORAGE_KEY_SEPARATED_SENTENCES = 'vpg_separated_sentences';
const LOCAL_STORAGE_KEY_SEPARATE_PARAMETERS = 'vpg_separate_parameters';
const SEPARATE_PDIC_API = 'https://flask-janome-api.herokuapp.com/separate_pdic';

class MarkovChain {
    constructor(segments, state_size) {
        this.map = new Map();
        this.state_size = state_size;
        for (let i = 0; i < segments.length - this.state_size; i++) {
            let segs = segments.slice(i, i + this.state_size).join('\t');
            let next_seg = segments[i + this.state_size];
            if (this.map.has(segs)) {
                this.map.get(segs).push(next_seg);
            } else {
                this.map.set(segs, [next_seg]);
            }
        }
    }

    generate_sentence_internal(start_segment, stop_segment) {
        let start_candidates = [];
        for (let key of this.map.keys()) {
            if (key.split('\t')[0] == start_segment) {
                start_candidates.push(key);
            }
        }
        if (start_candidates.length == 0) {
            throw new NotFoundStartStringError("指定した最初の単語から文を生成できませんでした。\n最初の単語を変更してください。");
        }

        let previous_chunk = start_candidates[Math.floor(Math.random() * start_candidates.length)];
        let sentence = previous_chunk.replace('\t', '');
        let next_key = previous_chunk;
        while (true) {
            let candidates = this.map.get(next_key);
            let next_segment = candidates[Math.floor(Math.random() * candidates.length)];
            if (next_segment === stop_segment) {
                break;
            }

            sentence += next_segment;
            next_key = next_key.split('\t').slice(1).join('\t') + '\t' + next_segment;
            if (!this.map.has(next_key)) {
                break;
            }
        }

        return sentence;
    }

    generate_sentence(start_segment, stop_segment, contain_strings, min_length, max_length, max_number_of_trials, exclude_pdic_src) {
        for (let i = 0; i < max_number_of_trials; i++) {
            let sentence = this.generate_sentence_internal(start_segment, stop_segment);
            if (sentence.length >= min_length && sentence.length <= max_length &&
                contain_strings.every(s => sentence.includes(s)) &&
                (!exclude_pdic_src || !this.is_pdic_phrase(sentence, start_segment))) {
                return sentence;
            }
        }
        throw new NotGenerateSentenceError("指定した条件の文を生成できませんでした。");
    }

    is_pdic_phrase(sentence, start_segment) {
        if (this.cache_phrases == undefined) {
            this.cache_phrases = separated_sentences.map(separated_sentence => separated_sentence.join(''));
        }
        let s = sentence;
        if (start_segment == BOS_SYMBOL) {
            s = s.slice(BOS_SYMBOL.length);
        }
        console.log(s);
        if (this.cache_phrases.includes(s)) {
            console.log(s);
        }
        return this.cache_phrases.includes(s);
    }
}

class NotFoundStartStringError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundStartStringError";
    }
}

class NotGenerateSentenceError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotGenerateSentenceError";
    }
}

let separated_sentences;
let separate_parameters;
let markov_chain_model;

let markov_chain_model_state_size = 2;
let error_message = '';

window.onload = function () {
    const button_build_model = document.getElementById('button_build_model');
    const button_delete_model = document.getElementById('button_delete_model');
    const button_generate_sentences = document.getElementById('button_generate_sentences');
    const button_user_dict_copy = document.getElementById('button_user_dict_copy');

    if (localStorage[LOCAL_STORAGE_KEY_SEPARATED_SENTENCES] != undefined) {
        let json_data = JSON.parse(localStorage[LOCAL_STORAGE_KEY_SEPARATED_SENTENCES]);
        separated_sentences = json_data["result"];
        separate_parameters = json_data["params"];
        build_current_model_view(separated_sentences, separate_parameters);
        markov_chain_model = build_markov_chain_model(separated_sentences, markov_chain_model_state_size, BOS_SYMBOL);
        if (markov_chain_model != undefined) {
            button_delete_model.disabled = false;
            button_generate_sentences.disabled = false;
        }
    }

    function fetchSeparatedSentences(pdic_file) {
        const upload = (file) => {
            const unicode_normalization = document.getElementById('checkbox_unicode_normalization').checked;
            const to_upper_case = document.getElementById('radio_to_upper_case').checked;
            const to_lower_case = document.getElementById('radio_to_lower_case').checked;
            const compound_noun = document.getElementById('checkbox_compound_noun').checked;
            const user_dict = document.getElementById('textarea_user_dict').value;

            const url = new URL(SEPARATE_PDIC_API);
            url.searchParams.set("unicode_normalization", unicode_normalization);
            url.searchParams.set("to_upper_case", to_upper_case);
            url.searchParams.set("to_lower_case", to_lower_case);
            url.searchParams.set("compound_noun", compound_noun);
            url.searchParams.set("user_dict", user_dict);

            fetch(url.toString(), {
                method: 'POST',
                headers: {
                    "Content-Type": "text/plain"
                },
                body: file
            }).then(response => {
                return response.json().then(data => {
                    if (response.ok) {
                        console.log(data)
                        separated_sentences = data["result"];
                        separate_parameters = data["params"];
                        build_current_model_view(separated_sentences, separate_parameters);
                        localStorage[LOCAL_STORAGE_KEY_SEPARATED_SENTENCES] = JSON.stringify(data);
                        markov_chain_model = build_markov_chain_model(separated_sentences, markov_chain_model_state_size, BOS_SYMBOL);
                        if (markov_chain_model != undefined) {
                            button_delete_model.disabled = false;
                            button_generate_sentences.disabled = false;
                        }
                    } else {
                        let error_message = data["message"];
                        alert("[ERROR]\nモデルを生成できませんでした。\nしばらく待ってから、やり直してください。\nこのアラートが何度も出る場合は、作者に報告してください。\n[内容]\n" + error_message)
                        console.log(error_message)
                    }
                });
            }).catch(
                error => {
                    alert("[ERROR]\nモデルを生成できませんでした。\nしばらく待ってから、やり直してください。\nこのアラートが何度も出る場合は、作者に報告してください。")
                    console.log(error.message)
                }
            ).finally(() => {
                button_build_model.disabled = false;
                button_build_model.innerHTML = `モデル生成`;
            });
        };

        upload(pdic_file);
    }

    function build_markov_chain_model(separated_sentences, n, bos_symbol) {
        segments = []
        for (let separated_sentence of separated_sentences) {
            segments.push(bos_symbol);
            Array.prototype.push.apply(segments, separated_sentence);
        }
        return new MarkovChain(segments, n);
    }

    function build_current_model_view(separated_sentences, separate_parameters) {
        const number_of_phrases = document.getElementById("view_model_info_number_of_phrases");
        const number_of_segments = document.getElementById("view_model_info_number_of_segments");
        const unicode_normalization = document.getElementById("view_model_info_unicode_normalization");
        const alphabet_filter = document.getElementById("view_model_info_alphabet_filter");
        const compound_noun = document.getElementById("view_model_info_compound_noun");

        if (separated_sentences == undefined) {
            number_of_phrases.innerHTML = "-";
            number_of_segments.innerHTML = "-";
        }

        if (separate_parameters == undefined) {
            unicode_normalization.innerHTML = "-";
            alphabet_filter.innerHTML = "-";
            compound_noun.innerHTML = "-";
        }

        if (separated_sentences == undefined || separate_parameters == undefined) {
            return;
        }

        number_of_phrases.innerHTML = separated_sentences.length;

        let count = 0;
        for (let sentence of separated_sentences) {
            count += sentence.length;
        }
        number_of_segments.innerHTML = count;

        if (separate_parameters != undefined) {
            unicode_normalization.innerHTML = separate_parameters["unicode_normalization"];
            compound_noun.innerHTML = separate_parameters["compound_noun"];
            build_user_dict_view(separate_parameters["user_dict"]);
            alphabet_filter.innerHTML = "なし";
            if (separate_parameters["to_lower_case"]) {
                alphabet_filter.innerHTML = "小文字化";
            } else if (separate_parameters["to_upper_case"]) {
                alphabet_filter.innerHTML = "大文字化";
            }
        }
    }

    function build_user_dict_view(user_dict) {
        const info_user_dict = document.getElementById("view_model_info_user_dict");
        const modal_body_user_dict = document.getElementById("modal_body_user_dict");

        let entries = user_dict.split("\n");
        let view = `0件`;

        if (user_dict != '' && entries.length > 0) {
            view = `${entries.length}件`;
            let view_entries = ``;
            for (let entry of entries) {
                let splits = entry.split(",");
                view_entries += `<tr><td>${splits[0]}</td><td>${splits[1]}</td><td>${splits[2]}</td></tr>`;
            }
            let view_table = `
                <table class="table" style="table-layout:fixed;">
                    <thead>
                        <tr>
                            <th>表層形</th>
                            <th>品詞</th>
                            <th>読み</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${view_entries}
                    </tbody>
                </table>
            `;
            modal_body_user_dict.innerHTML = view_table;

            view += `
                <button type="button" class="btn btn-link" data-toggle="modal" data-target="#modal_user_dict">
                    ...
                </button>`;

        }
        info_user_dict.innerHTML = view;
    }

    function build_result_view(generated_sentences) {
        let view = ``;
        for (let sentence of generated_sentences) {
            view += `<tr><td>${sentence}</td><td>${build_tweet_button(sentence)}</td></tr>`;
        }

        const result = document.getElementById("view_result_generated_sentences");
        result.innerHTML = view;
    }

    function build_tweet_button(sentence) {
        return `<a href="https://twitter.com/share?url=https://tammybee.github.io/voiceroid_phrase_generator/&related=tammybee_tmb&hashtags=ボイロフレーズジェネレーター&text=${encodeURI(sentence)}" rel="nofollow" target="_blank">Tweet</a>`;
    }

    button_build_model.addEventListener("click", () => {
        const input_txt_file = document.getElementById('input_txt_file');

        let files = input_txt_file.files;
        if (files.length == 0) {
            alert("[Error]\nファイルを選択していません。");
            return;
        }

        button_build_model.disabled = true;
        button_build_model.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 生成中...`;

        fetchSeparatedSentences(files[0]);
    })

    button_delete_model.addEventListener("click", () => {
        let result = window.confirm("現在のモデルを削除しますか？");
        if (!result) {
            return;
        }

        localStorage.removeItem(LOCAL_STORAGE_KEY_SEPARATED_SENTENCES);
        separated_sentences = undefined;
        separate_parameters = undefined;
        markov_chain_model = undefined;

        build_current_model_view(separated_sentences, separate_parameters);
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
        const exclude_pdic_src = document.getElementById('checkbox_exclude_pdic_src').checked;

        const starts_with_bos_symbol = (input_start_word === "");
        if (starts_with_bos_symbol) {
            input_start_word = BOS_SYMBOL;
            min_sentence_length += BOS_SYMBOL.length;
            max_sentence_length += BOS_SYMBOL.length;
        }

        let generated_sentences = [];
        for (let i = 0; i < number_of_sentences; i++) {
            try {
                let generated_sentence = markov_chain_model.generate_sentence(input_start_word, BOS_SYMBOL, input_contain_string, min_sentence_length, max_sentence_length, max_number_of_trials, exclude_pdic_src);
                if (starts_with_bos_symbol) {
                    generated_sentence = generated_sentence.slice(BOS_SYMBOL.length);
                }
                if (to_halfwidth) {
                    generated_sentence = generated_sentence.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
                        return String.fromCharCode(s.charCodeAt(0) - 65248);
                    });
                }
                generated_sentences.push(generated_sentence);
            } catch (error) {
                if (error instanceof NotFoundStartStringError) {
                    alert("[Error]\n" + error.message);
                    console.log(error);
                    break;
                } else {
                    generated_sentences.push("<div class='text-danger'>[Error] " + error.message + "</div>");
                    console.log(error);
                }
            }
        }

        if (generated_sentences.length > 0) {
            build_result_view(generated_sentences);
        }
    })

    button_user_dict_copy.addEventListener("click", () => {
        let str = separate_parameters["user_dict"];
        if (window.clipboardData) {
            window.clipboardData.setData(str);
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(str);
            alert("クリップボードにコピーしました。");
        } else {
            alert("[Error]\nクリップボードにコピーできませんでした。");
        }
    })

}
